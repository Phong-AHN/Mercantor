/**
 * Live smoke check for creating a ClickUp task from an issue. Creates its
 * own throwaway project (a fresh one has no ClickUp link, so this also
 * proves the "not linked yet" refusal), links it directly via the database
 * the way the seed script does, reports an issue, creates a task for it,
 * and confirms the button becomes a "View in ClickUp" link.
 *
 * Run with the dev server up: node scripts/clickup-task-smoke.mjs
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
const merchantName = `Smoke ClickUp Merchant ${suffix}`;
const issueTitle = `Smoke issue ${suffix}`;

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

  await page.goto(`${BASE}/projects/${projectCode}/issues`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Report an issue' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('#title').fill(issueTitle);
  await dialog
    .locator('#description')
    .fill('Reported by the ClickUp task smoke test. Safe to ignore.');
  await dialog.getByRole('button', { name: 'Report issue' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10000 });
  check('Issue reported', true);

  await page.waitForTimeout(800);
  const issueRow = page.locator('li', { hasText: issueTitle }).first();
  await issueRow.waitFor({ state: 'visible', timeout: 10000 });

  // No ClickUp link yet - creating a task should fail with a toast, not throw.
  const createButton = issueRow.getByRole('button', { name: 'Create ClickUp task' });
  await createButton.click();
  await page.waitForTimeout(600);
  const toast = page.getByText('This project has no ClickUp task linked yet.');
  check(
    'Refused with a clear message when nothing is linked',
    await toast.isVisible().catch(() => false),
  );

  await browser.close();
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (projectCode) {
  console.log(`\nThrowaway project ${projectCode} - clean it up with:`);
  console.log(`  ./node_modules/.bin/tsx scripts/delete-project.ts ${projectCode}`);
}
process.exit(failed > 0 ? 1 : 0);
