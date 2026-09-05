/**
 * Live smoke check for threaded replies and the portal's approval pipeline
 * view. Uses the seeded demo project - posting a comment and its own reply
 * is additive and harmless to leave behind, unlike the change-request smoke
 * test's one-way approval.
 *
 * Run with the dev server up: node scripts/thread-smoke.mjs
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

const stamp = Date.now();
const rootText = `Smoke thread root ${stamp}`;
const replyText = `Smoke thread reply ${stamp}`;

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

try {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'linh.tran@ahnmedia.example');
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  check('AHN PM signs in', page.url().includes('/dashboard'));

  await page.goto(`${BASE}/projects/PRJ-0001/activity`, { waitUntil: 'networkidle' });

  // Post a top-level comment.
  const composer = page.getByLabel('Write an update');
  await composer.fill(rootText);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.waitForTimeout(800);

  const rootItem = page.locator('li', { hasText: rootText }).first();
  const rootVisible = await rootItem
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('The posted comment appears in the feed', rootVisible);

  // Reply to it.
  await rootItem.getByRole('button', { name: 'Reply' }).click();
  const replyBox = rootItem.getByLabel('Write a reply');
  await replyBox.waitFor({ state: 'visible', timeout: 15000 });
  await replyBox.fill(replyText);
  await rootItem.getByRole('button', { name: 'Reply', exact: true }).last().click();

  const replyItem = page.locator('li', { hasText: replyText }).first();
  const replyVisible = await replyItem
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check('The reply appears nested under the parent', replyVisible);

  if (replyVisible) {
    // The reply's own "Reply" toggle should exist too - it is just another comment.
    const nested = await replyItem
      .getByRole('button', { name: 'Reply' })
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check('A reply can itself be replied to', nested);
  }

  // The portal approval pipeline view - a fresh, signed-out context so the
  // AHN session above cannot redirect the merchant sign-in away.
  await context.clearCookies();
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'owner@sunrisecoffee.example');
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/portal/approvals`, { waitUntil: 'networkidle' });
  const pipeline = page.getByText('The full approval pipeline');
  check('The pipeline card renders on the portal', await pipeline.isVisible().catch(() => false));

  const steps = page.locator('ol > li');
  const stepCount = await steps.count();
  check('All five approval checkpoints are listed', stepCount === 5, `${stepCount} steps`);
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
