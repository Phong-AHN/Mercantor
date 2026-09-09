/**
 * Post-deploy production smoke test: walks the real browser flow a brand-new
 * invited user goes through, then a second sign-in, then a handful of
 * authenticated pages, then creates one real project through the UI.
 *
 * Needs a live, unused invite token and the temp password you want to set:
 *
 *   node scripts/verify-production.mjs <invite-token> <temp-password>
 *
 * RELAY_URL overrides the target (default https://www.mercantor.co).
 * RELAY_AS overrides the sign-in email (default team@asianhustlenetwork.com).
 *
 * Screenshots land in scripts/shots/ (prod-dashboard.png, prod-project-created.png).
 */
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.RELAY_URL ?? 'https://www.mercantor.co';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EMAIL = process.env.RELAY_AS ?? 'team@asianhustlenetwork.com';
const TOKEN = process.argv[2];
const TEMP_PASSWORD = process.argv[3];
if (!TOKEN || !TEMP_PASSWORD) {
  console.error('Usage: node scripts/verify-production.mjs <invite-token> <temp-password>');
  process.exit(1);
}

fs.mkdirSync('scripts/shots', { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(err.message));

try {
  await page.goto(`${BASE}/set-password?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  check('set-password page loaded', page.url().includes('/set-password'));

  await page.fill('#password', TEMP_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/set-password'), { timeout: 15000 });
  check('set-password succeeded and redirected off /set-password', true, page.url());

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  check('dashboard loads while authenticated', page.url().includes('/dashboard'));
  const dashboardText = await page.locator('body').innerText();
  check('dashboard shows real content', dashboardText.length > 200);
  await page.screenshot({ path: 'scripts/shots/prod-dashboard.png', fullPage: true });

  // --- Sign out, sign back in with the new password ---
  await context.clearCookies();
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', TEMP_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  check('sign-in with the set password succeeded', !page.url().includes('/sign-in'), page.url());

  const pagesToCheck = ['/dashboard', '/projects', '/people', '/integrations', '/settings', '/audit', '/analytics'];
  for (const path of pagesToCheck) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    const ok = !text.includes('Application error') && !text.includes('Internal Server Error') && text.length > 100;
    check(`${path} renders`, ok, ok ? '' : text.slice(0, 150));
  }

  // Real function test: create a project through the actual UI.
  await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
  const suffix = Date.now().toString().slice(-6);
  await page.fill('#merchantName', `Verify MVP Merchant ${suffix}`);
  await page.fill('#contactName', 'QA Bot');
  await page.fill('#contactEmail', `qa-${suffix}@example.com`);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/projects/new'), { timeout: 15000 }).catch(() => {});
  const afterCreateText = await page.locator('body').innerText();
  check(
    'creating a real project through the UI succeeded',
    !page.url().includes('/projects/new') || afterCreateText.includes(`Verify MVP Merchant ${suffix}`),
    page.url(),
  );
  await page.screenshot({ path: 'scripts/shots/prod-project-created.png', fullPage: true });

  check('no uncaught client-side JS errors across the whole run', pageErrors.length === 0, pageErrors.join(' | '));
} catch (err) {
  check('unexpected script error', false, err.message);
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
}
