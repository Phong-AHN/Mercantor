/**
 * Live smoke check for the analytics trends page (Phase 2's last item).
 * Confirms the nav link, the headline stats, and - the part a screenshot
 * caught during development that no test had (a `flex items-end` container
 * silently collapsing every bar to zero height) - that a bar chart actually
 * renders visible marks, not just an empty card with a legend underneath.
 *
 * Run with the dev server up: node scripts/analytics-smoke.mjs
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

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
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

  await page.getByRole('link', { name: 'Analytics' }).click();
  await page.waitForURL('**/analytics', { timeout: 15000 });
  check('The Analytics nav link opens /analytics', true);

  await page.waitForLoadState('networkidle');

  const startedStat = page.getByText('Started', { exact: true }).first();
  await startedStat.waitFor({ state: 'visible', timeout: 10000 });
  check('The "Started" headline stat renders', true);

  const cycleTimeCard = page.locator('text=Avg cycle time').first();
  check('The "Avg cycle time" headline stat renders', await cycleTimeCard.isVisible());

  // The bug a screenshot caught: `items-end` on the bar-chart row stretched
  // nothing, so every bar's `h-full` resolved against zero and the chart
  // rendered as an empty card. Some months genuinely have zero started or
  // launched, so a real bar could legitimately be 0px - the regression test
  // is that at least one bar, across the whole chart, has visible height.
  const bars = await page.locator('div.rounded-t-\\[4px\\]').all();
  const heights = await Promise.all(
    bars.map(async (bar) => (await bar.boundingBox())?.height ?? 0),
  );
  const tallest = Math.max(0, ...heights);
  check(
    'At least one throughput bar renders with visible height',
    tallest > 5,
    `${bars.length} bars, tallest ${Math.round(tallest)}px`,
  );

  check(
    'The chart legend shows a text label, not colour alone',
    (await page.getByText('Launched', { exact: true }).count()) > 0,
  );

  check(
    'SLA breach chart cites the D-041 decision in its description',
    await page.getByText('D-041', { exact: false }).first().isVisible().catch(() => false),
  );
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
