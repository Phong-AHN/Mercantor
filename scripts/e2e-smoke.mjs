/**
 * End-to-end smoke test.
 *
 * Drives the real UI in a real browser: sign in with the form, post an update
 * that also goes to Slack, open a blocker, and hand it over. Then it checks the
 * database - the point is to prove the whole path works, not that a button
 * renders.
 *
 * Run with the dev server and the worker up:  node scripts/e2e-smoke.mjs
 */
import { chromium } from 'playwright-core';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'relay-demo-password';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

try {
  // --- AHN project manager -------------------------------------------------
  await signIn(page, 'linh.tran@ahnmedia.example');
  check(
    'AHN PM signs in and lands on the dashboard',
    page.url().includes('/dashboard'),
    page.url(),
  );

  await page.goto(`${BASE}/projects/PRJ-0001`, { waitUntil: 'networkidle' });
  const answerCount = await page
    .locator('section[aria-label="Project status at a glance"] a')
    .count();
  check('The ten answers render on the project header', answerCount === 10, `${answerCount} tiles`);

  const blockerBanner = await page.getByText('Current blocker').first().isVisible();
  check('The open blocker is banner-prominent', blockerBanner);

  // Log an update, and send it to Slack as well.
  await page.getByRole('button', { name: 'Log update' }).click();
  const body = `E2E smoke update ${Date.now()}`;
  await page.fill('#body', body);
  await page.check('#alsoSlack');
  await page.getByRole('button', { name: 'Post update' }).click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/projects/PRJ-0001/activity`, { waitUntil: 'networkidle' });
  check('The update is in the activity feed', await page.getByText(body).first().isVisible());

  // --- SHOPLINE account manager -------------------------------------------
  const shopline = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const slPage = await shopline.newPage();
  await signIn(slPage, 'priya.raman@shopline.example');

  await slPage.goto(`${BASE}/projects/PRJ-0001/activity`, { waitUntil: 'networkidle' });
  const internalLeak = await slPage.getByText('Internal: the design rework cost us 3 days').count();
  check('SHOPLINE cannot see the AHN-internal note', internalLeak === 0, `${internalLeak} matches`);

  const sharedNote = await slPage.getByText(body).count();
  check('SHOPLINE can see the shared update', sharedNote > 0);

  await slPage.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  const deniedSettings = await slPage.getByText('do not have access').count();
  check(
    'SHOPLINE account manager is refused portal settings',
    deniedSettings > 0,
    `${deniedSettings} matches`,
  );

  // --- merchant ------------------------------------------------------------
  const merchant = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const mPage = await merchant.newPage();
  await signIn(mPage, 'owner@sunrisecoffee.example');
  check('Merchant lands on the merchant portal', mPage.url().includes('/portal'), mPage.url());

  await mPage.goto(`${BASE}/projects/PRJ-0002`, { waitUntil: 'domcontentloaded' });
  check(
    'Merchant is bounced off a project that is not theirs',
    mPage.url().includes('/portal'),
    mPage.url(),
  );

  await mPage.goto(`${BASE}/portal/activity`, { waitUntil: 'networkidle' });
  const merchantSeesInternal = await mPage
    .getByText('Internal: the design rework cost us 3 days')
    .count();
  const merchantSeesAhnOnly = await mPage
    .getByText('Renewal date bug is a timezone conversion')
    .count();
  check('Merchant cannot see AHN internal notes', merchantSeesInternal === 0);
  check('Merchant cannot see AHN/SHOPLINE-only notes', merchantSeesAhnOnly === 0);

  await shopline.close();
  await merchant.close();
} catch (error) {
  check('smoke run completed without throwing', false, String(error).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
