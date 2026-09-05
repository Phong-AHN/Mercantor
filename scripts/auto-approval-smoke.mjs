/**
 * Live smoke check for automated approval requests. Creates its own
 * throwaway project (advancing its stage several times is not something
 * worth leaving on the seeded demo project), moves it into Internal QA, and
 * confirms the Development checkpoint went to PENDING with no "requested
 * by" name - the system asked for it, not a person.
 *
 * Run with the dev server up: node scripts/auto-approval-smoke.mjs
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

const suffix = Date.now();
const merchantName = `Smoke Auto-Approval Merchant ${suffix}`;

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

let projectCode = null;

try {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'linh.tran@ahnmedia.example');
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  check('AHN PM signs in', page.url().includes('/dashboard'));

  await page.goto(`${BASE}/projects/new`, { waitUntil: 'networkidle' });
  await page.fill('#merchantName', merchantName);
  await page.fill('#contactName', 'Smoke Contact');
  await page.fill('#contactEmail', `smoke-${suffix}@relay.test`);
  await Promise.all([
    page.waitForURL((url) => /\/projects\/PRJ-\d+/.test(url.pathname), { timeout: 15000 }),
    page.getByRole('button', { name: 'Create project' }).click(),
  ]);
  projectCode = new URL(page.url()).pathname.match(/PRJ-\d+/)?.[0] ?? null;
  check('A throwaway project is created', projectCode !== null, projectCode ?? page.url());

  // "Move stage" opens a dialog with a plain <select> of every legal target
  // stage - Internal QA is a legal forward jump straight from Introduction.
  await page.goto(`${BASE}/projects/${projectCode}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Move stage' }).click();
  const stageDialog = page.getByRole('dialog', { name: 'Move this project to another stage' });
  await stageDialog.waitFor({ state: 'visible' });
  await stageDialog.locator('#stage').selectOption('INTERNAL_QA');
  await stageDialog.getByRole('button', { name: /^Move to/ }).click();
  await stageDialog.waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/projects/${projectCode}/approvals`, { waitUntil: 'networkidle' });
  const heading = page.getByText('Development approved', { exact: true }).first();
  check('The Development checkpoint renders', await heading.isVisible().catch(() => false));

  // Nobody clicked "Request" - this project has never had a manual request,
  // so the only way "automatically" appears is the auto-request firing.
  const autoLabel = page.getByText('automatically', { exact: true }).first();
  check(
    'It shows "automatically" rather than a person\'s name',
    await autoLabel.isVisible().catch(() => false),
  );

  const pendingBadges = page.getByText('Pending', { exact: true });
  const pendingCount = await pendingBadges.count();
  check('At least one checkpoint shows Pending', pendingCount > 0, `${pendingCount} pending`);
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (projectCode) {
  console.log(`\nThrowaway project ${projectCode} - clean it up with:`);
  console.log(`  ./node_modules/.bin/tsx scripts/delete-project.ts ${projectCode}`);
}
process.exit(failed > 0 ? 1 : 0);
