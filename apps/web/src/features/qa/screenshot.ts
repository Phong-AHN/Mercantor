import 'server-only';
import Chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import type { CaptureViewport } from '@relay/core';
import { MAX_CAPTURE_HEIGHT, VIEWPORTS } from './capture-plan';
import { assertFetchable, FetchRefused, isBlockedSubresource, USER_AGENTS } from './fetch-page';

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
      if (rect.width * rect.height >= area * 0.4) element.style.setProperty('display', 'none', 'important');
    }
    // Modals lock scrolling; unlocked, the page lays out at full length again.
    for (const root of [document.documentElement, document.body]) {
      root.style.setProperty('overflow', 'visible', 'important');
    }
  });
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
  options: { allowedHosts: readonly string[]; viewport: CaptureViewport },
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

    let status = 0;
    try {
      const response = await page.goto(sourceUrl, {
        waitUntil: 'networkidle2',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      status = response?.status() ?? 0;
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
    }

    if (status >= 400) throw new CaptureFailed(`The page returned ${status}.`);
    const finalUrl = page.url();
    if (/^\/password\/?$/.test(new URL(finalUrl).pathname)) {
      throw new CaptureFailed(
        'The storefront is password protected. Remove the password, or upload a capture by hand.',
      );
    }

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
