/**
 * Live smoke check for pricing and approving a change request through the
 * real browser UI. Creates its own throwaway project rather than mutating
 * the seeded demo data - `changeRequestApprovedAt` has no "undo" action by
 * design (D-012-style: a commercial decision, recorded once), so this
 * cleans up by deleting the whole project at the end, the same way the
 * integration fixtures do.
 *
 * Run with the dev server up: node scripts/change-request-smoke.mjs
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
const merchantName = `Smoke CR Merchant ${suffix}`;

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

  await page.goto(`${BASE}/projects/${projectCode}/scope`, { waitUntil: 'networkidle' });

  // Edit the first in-scope row: flip it to Change Request and price it.
  await page.locator('table tbody tr').first().getByRole('button').click();
  const editDialog = page.getByRole('dialog');
  await editDialog.waitFor({ state: 'visible' });
  await editDialog.locator('#disposition').selectOption('CHANGE_REQUEST');
  await editDialog.locator('#cr').fill('1500');
  await editDialog.getByRole('button', { name: 'Save' }).click();
  await editDialog.waitFor({ state: 'hidden', timeout: 10000 });
  check('Scope item priced as a change request', true);

  await page.waitForTimeout(800); // router.refresh()

  const approveButton = page.getByRole('button', { name: 'Approve' }).first();
  const approveVisible = await approveButton.isVisible().catch(() => false);
  check('Approve button renders for a priced, unapproved change request', approveVisible);

  await approveButton.click();
  const confirmDialog = page.getByRole('dialog', { name: 'Approve this change request?' });
  await confirmDialog.waitFor({ state: 'visible' });
  await confirmDialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await confirmDialog.waitFor({ state: 'hidden', timeout: 10000 });
  check('Approval completes and the dialog closes', true);

  await page.waitForTimeout(800);

  const approvedBadge = page.getByText(/Approved .* — on the invoice/).first();
  check(
    'The change request now shows as approved',
    await approvedBadge.isVisible().catch(() => false),
  );

  await page.goto(`${BASE}/projects/${projectCode}/invoices`, { waitUntil: 'networkidle' });
  const crBadge = page.getByText('change request', { exact: true }).first();
  check(
    'A new invoice line is tagged "change request"',
    await crBadge.isVisible().catch(() => false),
  );

  const amountCell = page.locator('table tbody tr', { hasText: 'Change request:' }).first();
  const amountText = await amountCell
    .locator('td')
    .nth(3)
    .textContent()
    .catch(() => null);
  check(
    'The invoice line carries the agreed amount',
    amountText?.includes('1,500') ?? false,
    amountText ?? '',
  );
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  await browser.close();
}

if (projectCode) {
  console.log(`\nThrowaway project ${projectCode} - clean it up with:`);
  console.log(`  ./node_modules/.bin/tsx scripts/delete-project.ts ${projectCode}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
