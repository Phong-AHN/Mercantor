/**
 * Browser smoke check for the October 2026 security pass - the things only a
 * real browser shows: where a `?next=` redirect actually lands, whether the
 * CSP lets an upload reach the bucket, and whether an inline image renders.
 *
 * Run with the dev server and infra up: node scripts/security-smoke.mjs
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'relay-demo-password';
const BACKSLASH = String.fromCharCode(92);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

// A real 2x2 PNG, so the server-side sniff accepts it.
const pixel = path.join(tmpdir(), 'security-smoke.png');
writeFileSync(
  pixel,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const browser = await chromium.launch({ executablePath: CHROME });

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(120000);
  const page = await context.newPage();
  const cspViolations = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
  });
  return { context, page, cspViolations };
}

async function signIn(page, email, next) {
  const query = next === undefined ? '' : `?next=${encodeURIComponent(next)}`;
  await page.goto(`${BASE}/sign-in${query}`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/sign-in')),
    page.click('button[type="submit"]'),
  ]);
}

try {
  // --- ?next= stays on this site --------------------------------------------
  {
    const { context, page } = await freshPage();
    await signIn(page, 'linh.tran@ahnmedia.example', '/projects/PRJ-0001');
    check(
      'Sign-in returns to a same-site ?next=',
      new URL(page.url()).pathname === '/projects/PRJ-0001',
      page.url(),
    );
    await context.close();
  }
  for (const next of [`/${BACKSLASH}evil.example`, '/\t/evil.example', '//evil.example']) {
    const { context, page } = await freshPage();
    await signIn(page, 'linh.tran@ahnmedia.example', next);
    check(
      `Sign-in refuses ?next=${JSON.stringify(next)}`,
      new URL(page.url()).origin === new URL(BASE).origin,
      page.url(),
    );
    await context.close();
  }

  // --- An update with an image: upload past the CSP, render inline -----------
  {
    const { context, page, cspViolations } = await freshPage();
    await signIn(page, 'linh.tran@ahnmedia.example');
    await page.goto(`${BASE}/projects/PRJ-0001/activity`, { waitUntil: 'networkidle' });
    const body = `Security smoke image ${Date.now()}`;
    await page.getByLabel('Write an update').fill(body);
    await page.locator('input[type="file"][multiple]').first().setInputFiles(pixel);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    const row = page.locator('li', { has: page.locator('p', { hasText: body }) }).first();
    const posted = await row
      .waitFor({ timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    check('An update with an image posts', posted);
    check(
      'No CSP violation while uploading',
      cspViolations.length === 0,
      cspViolations[0]?.slice(0, 160),
    );

    const image = row.locator('img[src*="inline=1"]').first();
    const renders = await image
      .waitFor({ timeout: 30000 })
      .then(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
      .catch(() => false);
    check('The image renders inline in the thread', renders);
    await context.close();
  }

  // --- Signed out, nothing is served -----------------------------------------
  {
    const { context, page } = await freshPage();
    const file = await page.request.get(
      `${BASE}/api/attachments/01900000-0000-7000-8000-000000000000?inline=1`,
    );
    check('A signed-out file request is refused', file.status() === 401, String(file.status()));
    const csv = await page.request.get(`${BASE}/api/projects/export`);
    check('A signed-out export is refused', csv.status() === 401, String(csv.status()));
    await context.close();
  }
} catch (error) {
  check('smoke run completed without throwing', false, String(error).slice(0, 300));
}

await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
