/**
 * Live smoke check for formal SLA breach records (D-041). Uses the seeded
 * demo project PRJ-0003 (WAITING_FOR_ACCESS since 48 days ago, target launch
 * date 12 days overdue by design) rather than a throwaway one - a project
 * this fresh cannot honestly be "already overdue" without violating the
 * `Project_target_after_start` check constraint, so there is no way to
 * fabricate this scenario for a brand-new project. A plain, unchanged
 * "Save details" click on the settings form still exercises the real thing:
 * `updateProjectAction`'s own transactional `recomputeHealth` opening a
 * `SlaBreach` row immediately, not on the worker's next 15-minute sweep.
 * The target launch date is captured and restored at the end, so the
 * seeded project is left exactly as it was found.
 *
 * Run with the dev server up: node scripts/sla-breach-smoke.mjs
 */
import { chromium } from 'playwright-core';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'relay-demo-password';
const CODE = 'PRJ-0003';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const isoDate = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const saveDetails = async (page) => {
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.waitForTimeout(800);
};

const launchRow = (page) => page.locator('tr', { hasText: 'Target launch date passed' }).first();

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));

let originalTarget = null;

try {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'linh.tran@ahnmedia.example');
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  check('AHN PM signs in', page.url().includes('/dashboard'));

  await page.goto(`${BASE}/projects/${CODE}/settings`, { waitUntil: 'networkidle' });
  originalTarget = await page.locator('#targetLaunchDate').inputValue();
  check(
    'The seeded project already has an overdue target launch date',
    originalTarget.length > 0,
    originalTarget,
  );

  // Unchanged save - proves the breach opens the instant a mutation touches
  // the project, not only on the worker's periodic sweep.
  await saveDetails(page);

  await page.goto(`${BASE}/projects/${CODE}/time`, { waitUntil: 'networkidle' });
  check(
    'The launch-overrun breach appears on the Time & SLA tab',
    await launchRow(page).isVisible().catch(() => false),
  );
  check(
    'It is marked still open',
    await launchRow(page).getByText('still open', { exact: true }).isVisible().catch(() => false),
  );
  const anyStageBreach = await page.getByText(/ran over$/).first().isVisible().catch(() => false);
  check('A stage-overrun breach is also recorded (48 days in Waiting for Access)', anyStageBreach);

  // Push the date out - the same recomputeHealth pass should resolve it.
  await page.goto(`${BASE}/projects/${CODE}/settings`, { waitUntil: 'networkidle' });
  await page.fill('#targetLaunchDate', isoDate(30));
  await saveDetails(page);

  await page.goto(`${BASE}/projects/${CODE}/time`, { waitUntil: 'networkidle' });
  const resolvedRow = launchRow(page);
  check(
    'Pushing the date out resolves the launch breach',
    !(await resolvedRow.getByText('still open', { exact: true }).isVisible().catch(() => false)),
  );
  check('The resolved breach stays in the history rather than disappearing', await resolvedRow.isVisible());
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  if (originalTarget) {
    await page.goto(`${BASE}/projects/${CODE}/settings`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.fill('#targetLaunchDate', originalTarget).catch(() => {});
    await saveDetails(page).catch(() => {});
    check('Seeded project restored to its original target launch date', true);
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
