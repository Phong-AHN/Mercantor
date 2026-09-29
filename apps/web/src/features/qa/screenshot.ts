import 'server-only';
import Chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';
import type { CaptureViewport } from '@relay/core';
import { MAX_CAPTURE_HEIGHT, VIEWPORTS } from './capture-plan';
import { assertFetchable, FetchRefused, isBlockedSubresource, USER_AGENTS } from './fetch-page';
import { isPasswordPage } from './password-page';

/**
 * Full-page screenshots with a real browser, inside the web app's own
 * serverless function - no worker, no third-party screenshot service.
 *
 * On Vercel (Linux) the browser is `@sparticuz/chromium`, a Chromium build
 * small enough for a function bundle. Locally it is the installed Chrome, or
 * whatever `CHROME_EXECUTABLE_PATH` points at.
 */

export class CaptureFailed extends Error {}

const NAVIGATION_TIMEOUT_MS = 30_000;

async function launch(): Promise<Browser> {
  const configured = process.env.CHROME_EXECUTABLE_PATH;
  if (!configured && process.platform === 'linux') {
    Chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: Chromium.args, headless: 'shell' }),
      executablePath: await Chromium.executablePath(),
      headless: 'shell',
    });
  }
  const local =
    configured ??
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return puppeteer.launch({ executablePath: local, headless: true });
}

/** Consent, newsletter and region pop-ups most storefronts open on first visit. */
const DISMISS_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#shopify-pc__banner__btn-accept',
  '[data-cookiefirst-action="accept"]',
  '.cc-allow',
  '.klaviyo-close-form',
  '[role="dialog"] button[aria-label*="close" i]',
  '[aria-modal="true"] button[aria-label*="close" i]',
  '[role="dialog"] [aria-label*="dismiss" i]',
];

async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  for (const selector of DISMISS_SELECTORS) {
    const handle = await page.$(selector).catch(() => null);
    if (!handle) continue;
    await handle.click({ delay: 20 }).catch(() => undefined);
    await handle.dispose();
  }
  // Whatever is still covering most of the screen is a modal or its backdrop,
  // not content: a sticky header is fixed too, but short.
  await page.evaluate(() => {
    const area = window.innerWidth * window.innerHeight;
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' || style.display === 'none') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width * rect.height >= area * 0.4)
        element.style.setProperty('display', 'none', 'important');
    }
    // Modals lock scrolling; unlocked, the page lays out at full length again.
    for (const root of [document.documentElement, document.body]) {
      root.style.setProperty('overflow', 'visible', 'important');
    }
  });
}

/**
 * The storefront password field, made typeable.
 *
 * The storefront form is preferred - a hidden account-login drawer can hold
 * an earlier password field that typing into would never submit. Shopline's
 * password theme keeps that form in a closed `<details>` modal behind a
 * "Login with password" button, so the field is invisible until the modal
 * opens; its summary is clicked (the theme's own handler opens and mounts
 * it), and the field is looked up again once visible, since the theme may
 * move the modal.
 */
async function revealPasswordField(page: Page): Promise<ElementHandle<HTMLInputElement> | null> {
  const find = async (): Promise<ElementHandle<HTMLInputElement> | null> => {
    const handle = await page.evaluateHandle(() => {
      const isStorefront = (input: HTMLInputElement) => {
        const form = input.form;
        if (!form) return false;
        if (form.querySelector('input[name="form_type"][value="storefront_password"]')) return true;
        try {
          return /\/password\/?$/i.test(new URL(form.action, location.href).pathname);
        } catch {
          return false;
        }
      };
      const isVisible = (input: HTMLInputElement) => input.getClientRects().length > 0;
      const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];
      const storefront = inputs.filter(isStorefront);
      return (
        storefront.find(isVisible) ??
        storefront[0] ??
        inputs.find(isVisible) ??
        inputs[0] ??
        null
      );
    });
    const element = handle.asElement() as ElementHandle<HTMLInputElement> | null;
    if (!element) await handle.dispose();
    return element;
  };

  const field = await find();
  if (!field || (await field.isVisible())) return field;

  const opened = await field.evaluate((input) => {
    const details = input.closest('details');
    const summary = details?.querySelector<HTMLElement>(':scope > summary');
    if (!details) return false;
    if (!details.open) summary?.click();
    return true;
  });
  if (!opened) return field;
  const visible = await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].some(
          (input) => input.getClientRects().length > 0,
        ),
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false);
  // A theme whose summary does not open its modal: open the details directly.
  if (!visible) {
    await field.evaluate((input) => input.closest('details')?.setAttribute('open', ''));
  }
  await field.dispose();
  return find();
}

export interface Screenshot {
  bytes: Uint8Array;
  /** Image pixels, i.e. CSS pixels × device scale factor. */
  width: number;
  height: number;
  finalUrl: string;
  truncated: boolean;
}

export async function captureScreenshot(
  sourceUrl: string,
  options: { allowedHosts: readonly string[]; viewport: CaptureViewport; password?: string },
): Promise<Screenshot> {
  // The page itself gets the full check, DNS included; everything it then
  // loads gets the cheap per-request check below.
  await assertFetchable(new URL(sourceUrl), options.allowedHosts);

  const viewport = VIEWPORTS[options.viewport];
  const maxHeight = MAX_CAPTURE_HEIGHT[options.viewport];
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setUserAgent({ userAgent: USER_AGENTS[options.viewport] });
    await page.setRequestInterception(true);

    let leftStorefront = false;
    page.on('request', (request) => {
      if (request.isInterceptResolutionHandled()) return;
      const url = request.url();
      let blocked = isBlockedSubresource(url);
      if (!blocked && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        const host = new URL(url).hostname.toLowerCase();
        if (!options.allowedHosts.includes(host)) {
          blocked = true;
          leftStorefront = true;
        }
      }
      void (blocked ? request.abort('blockedbyclient') : request.continue());
    });

    const navigate = async (): Promise<number> => {
      try {
        const response = await page.goto(sourceUrl, {
          waitUntil: 'networkidle2',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        return response?.status() ?? 0;
      } catch (error) {
        // A storefront whose chat widget never stops polling is still loaded;
        // anything else (DNS, TLS, refused, blocked redirect) is a failure.
        if (!(error instanceof Error && error.name === 'TimeoutError')) {
          throw new CaptureFailed(
            leftStorefront
              ? 'The page redirected off the storefront, so it was not captured.'
              : 'The page did not load.',
          );
        }
        return 0;
      }
    };
    const onPasswordPage = async () => isPasswordPage(page.url(), await page.content());

    let status = await navigate();
    // Checked before the status: some password pages answer 401.
    if (await onPasswordPage()) {
      if (!options.password) {
        throw new CaptureFailed(
          'This storefront is password protected. Add its password in Site QA → Storefront, or upload a capture by hand.',
        );
      }
      const field = await revealPasswordField(page);
      if (!field) throw new CaptureFailed('The storefront password page could not be read.');
      await field.type(options.password);
      await Promise.all([
        page
          .waitForNavigation({ waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS })
          .catch(() => undefined),
        field.press('Enter'),
      ]);
      status = await navigate();
      if (await onPasswordPage()) {
        throw new CaptureFailed(
          'The storefront password was not accepted. Check it in Site QA → Storefront.',
        );
      }
    }

    if (status >= 400) throw new CaptureFailed(`The page returned ${status}.`);
    const finalUrl = page.url();

    // Frozen motion, so a carousel mid-slide or a fading hero is not what
    // gets compared.
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}',
    });

    await dismissOverlays(page);

    // Scroll through once so lazy-loaded images below the fold are in the shot.
    await page.evaluate(async (limit: number) => {
      const step = Math.max(400, window.innerHeight);
      const end = Math.min(document.documentElement.scrollHeight, limit);
      for (let y = 0; y < end; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      window.scrollTo(0, 0);
    }, maxHeight);
    await new Promise((resolve) => setTimeout(resolve, 800));
    // Again: some pop-ups are on a timer or open on scroll.
    await dismissOverlays(page);

    const fullHeight = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    );
    const height = Math.max(viewport.height, Math.min(fullHeight, maxHeight));

    const bytes = await page.screenshot({
      type: 'jpeg',
      quality: 72,
      clip: { x: 0, y: 0, width: viewport.width, height },
      captureBeyondViewport: true,
    });

    return {
      bytes,
      width: viewport.width * viewport.deviceScaleFactor,
      height: height * viewport.deviceScaleFactor,
      finalUrl,
      truncated: fullHeight > maxHeight,
    };
  } catch (error) {
    if (error instanceof CaptureFailed || error instanceof FetchRefused) throw error;
    throw new CaptureFailed('The browser could not capture this page.');
  } finally {
    await browser.close().catch(() => undefined);
  }
}
