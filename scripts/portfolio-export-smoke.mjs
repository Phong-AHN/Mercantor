/**
 * Live smoke check for the portfolio CSV export. Signs in as an AHN PM
 * (holds invoice:read) and an AHN developer (does not), confirms the
 * "Export CSV" link on /projects downloads a real CSV whose money columns
 * follow the same RBAC gate as the table, and that the current filters (the
 * query string) are honoured by the file the same way they filter the screen.
 *
 * Run with the dev server up: node scripts/portfolio-export-smoke.mjs
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
  // --- AHN PM: full export, money columns included -----------------------
  await signIn(page, 'linh.tran@ahnmedia.example');
  check('AHN PM signs in', page.url().includes('/dashboard'));

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  const exportLink = page.getByRole('link', { name: 'Export CSV' });
  await exportLink.waitFor({ state: 'visible', timeout: 10000 });
  check('Export CSV link renders on the portfolio page', true);

  const href = await exportLink.getAttribute('href');
  check('Link points at the export route', href === '/api/projects/export', href ?? 'null');

  const pmResponse = await context.request.get(new URL(href, BASE).toString());
  check('Export request succeeds', pmResponse.ok(), String(pmResponse.status()));
  check(
    'Response is a CSV attachment',
    (pmResponse.headers()['content-type'] ?? '').includes('text/csv') &&
      (pmResponse.headers()['content-disposition'] ?? '').includes(
        'attachment; filename="relay-portfolio-',
      ),
    JSON.stringify(pmResponse.headers()),
  );

  const pmCsv = await pmResponse.text();
  const pmLines = pmCsv.trim().split('\r\n');
  check(
    'CSV has a header row and at least one project row',
    pmLines.length > 1 && pmLines[0].startsWith('Code,'),
    `${pmLines.length} lines`,
  );
  check(
    'A PM (invoice:read) sees money columns in the file',
    pmLines[0].includes('Contract total') && pmLines[0].includes('Invoice status'),
  );

  // --- Filters in the URL flow straight into the export -------------------
  await page.fill('input[placeholder="Merchant, project code or store ID"]', 'zzz-no-such-project');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const filteredHref = await page.getByRole('link', { name: 'Export CSV' }).getAttribute('href');
  check('Export link carries the active filter', filteredHref?.includes('q=zzz-no-such-project'));

  const filteredResponse = await context.request.get(new URL(filteredHref, BASE).toString());
  const filteredCsv = (await filteredResponse.text()).trim().split('\r\n');
  check(
    'A filter that matches nothing exports only the header row',
    filteredCsv.length === 1,
    `${filteredCsv.length} lines`,
  );

  // --- AHN developer: no invoice:read, no money columns --------------------
  await context.clearCookies();
  await signIn(page, 'marcus.hale@ahnmedia.example');
  check('AHN developer signs in', page.url().includes('/dashboard'));

  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
  const devHref = await page.getByRole('link', { name: 'Export CSV' }).getAttribute('href');
  const devResponse = await context.request.get(new URL(devHref, BASE).toString());
  const devHeader = (await devResponse.text()).trim().split('\r\n')[0];
  check(
    'A developer (no invoice:read) gets no money columns in the file',
    !devHeader.includes('Contract total') && !devHeader.includes('Invoice status'),
  );

  // --- No session: the route refuses, same as every other action ----------
  const freshContext = await browser.newContext();
  const anonResponse = await freshContext.request.get(new URL(href, BASE).toString());
  check('An unauthenticated request is refused', anonResponse.status() === 401);
  await freshContext.close();

  await browser.close();
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
