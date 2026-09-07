/**
 * Live smoke check for D-045: linking a project's own Slack channel and
 * ClickUp task from its Settings page, the UI path that did not exist
 * before (only `pnpm db:seed` or a direct database write could set an
 * `IntegrationLink`).
 *
 * Runs against whatever provider credentials the dev server actually has -
 * live Slack, in this project's case - so the Slack half is a real
 * `conversations.list` call and a real link, not a mock. ClickUp is checked
 * on its refusal path only, since a positive link needs a real task id this
 * script cannot know in advance; the positive path is covered deterministically
 * by `actions.integration.test.ts` against the mock adapter.
 *
 * Run with the dev server up: node scripts/integration-link-smoke.mjs
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
const merchantName = `Smoke Integration Link Merchant ${suffix}`;

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1100 } });
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

  await page.goto(`${BASE}/projects/${projectCode}/settings`, { waitUntil: 'networkidle' });

  // --- ClickUp: refused cleanly for a task that does not exist -----------
  await page.locator('#clickup-task').fill('this-task-does-not-exist-12345');
  await page
    .locator('#clickup-task')
    .locator('xpath=ancestor::div[contains(@class,"space-y-2")]')
    .getByRole('button', { name: 'Connect' })
    .click();
  await page.waitForTimeout(1000);
  const clickUpError = page.locator('text=/could not be found|ClickUp/i').first();
  check(
    'A non-existent ClickUp task is refused, not thrown',
    await clickUpError.isVisible().catch(() => false),
  );

  // --- Slack: pick the first live channel and connect ---------------------
  // Either the channel list renders, or the workspace's bot token is missing
  // a scope `conversations.list` needs - both are a clean, readable outcome,
  // never a thrown error or a blank card. Which one happens here depends on
  // real Slack app configuration this script does not control.
  const slackSelect = page.locator('#slack-channel');
  const hasChannels = await slackSelect.isVisible().catch(() => false);
  const slackScopeError = page.locator('text=/OAuth scope|Slack channels could not be listed/i');
  check(
    'Slack either lists live channels or explains why it cannot',
    hasChannels || (await slackScopeError.isVisible().catch(() => false)),
  );

  if (hasChannels) {
    const firstOption = await slackSelect.locator('option').first().textContent();
    await slackSelect
      .locator('xpath=ancestor::div[contains(@class,"space-y-2")]')
      .getByRole('button', { name: 'Connect' })
      .click();
    await page.waitForTimeout(1200);
    const openInSlack = page.getByRole('link', { name: /Open in Slack/i });
    check(
      `Connects to the selected channel (${firstOption?.trim()})`,
      await openInSlack.isVisible().catch(() => false),
    );

    // --- Disconnect removes it and the connect form comes back ----------
    const disconnect = page.getByRole('button', { name: 'Disconnect' }).first();
    await disconnect.click();
    await page.waitForTimeout(1200);
    check(
      'Disconnecting brings back the connect form',
      await page.locator('#slack-channel').isVisible().catch(() => false),
    );
  }

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
