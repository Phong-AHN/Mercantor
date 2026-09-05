/**
 * Screenshot helper for visual QA.
 *
 *   node scripts/shot.mjs '[["name","/path",{"dark":true,"full":false}]]'
 *
 * Signs in as a seeded account (RELAY_AS, default the AHN project manager) with
 * the real form, so what it captures is what a person would see.
 */
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EMAIL = process.env.RELAY_AS ?? 'linh.tran@ahnmedia.example';
const PASSWORD = 'relay-demo-password';

const targets = JSON.parse(process.argv[2] ?? '[]');
fs.mkdirSync('scripts/shots', { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({
  viewport: { width: 1560, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.fill('#email', EMAIL);
await page.fill('#password', PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

for (const [name, url, options = {}] of targets) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate((dark) => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, options.dark);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `scripts/shots/${name}.png`,
    fullPage: options.full ?? true,
  });
  console.log('shot', name);
}

await browser.close();
