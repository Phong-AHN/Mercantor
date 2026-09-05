/**
 * Live smoke check for the file-upload path, through the real browser UI -
 * not the integration test's direct action calls. Confirms the whole chain a
 * user experiences: pick a file, presigned POST to MinIO, confirm, see the
 * link, and fetch it back through the RBAC-gated download route.
 *
 * Run with the dev server up: node scripts/upload-smoke.mjs
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PASSWORD = 'relay-demo-password';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

// A tiny but real PNG - big enough that a JPEG/GIF sniff would not accidentally match.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
    '53de0000000c4944415478da6360000002000155ffe1a50000000049454e44ae426082',
  'hex',
);
const tmpFile = 'C:/Users/pinlo/AppData/Local/Temp/claude/upload-smoke.png';
writeFileSync(tmpFile, PNG);

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
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

  await page.goto(`${BASE}/projects/PRJ-0001/assets`, { waitUntil: 'networkidle' });

  const uploadButtons = page.getByRole('button', { name: 'Upload file' });
  const buttonCount = await uploadButtons.count();
  check(
    'Upload file button renders on the assets checklist',
    buttonCount > 0,
    `${buttonCount} buttons`,
  );

  await uploadButtons.first().click();
  const dialog = page.getByRole('dialog', { name: 'Upload a file' });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

  await dialog.locator('input[type="file"]').setInputFiles(tmpFile);
  await page.waitForTimeout(300);

  const labelInput = dialog.getByLabel('Label', { exact: true });
  const labelValue = await labelInput.inputValue();
  check('Label auto-fills from the picked filename', labelValue === 'upload-smoke.png', labelValue);

  await dialog.getByRole('button', { name: 'Upload', exact: true }).click();

  // Wait for the dialog to close, which only happens on confirmUploadAction success.
  await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  check('Upload completes and the dialog closes', true);

  await page.waitForTimeout(1000); // router.refresh()

  const link = page.getByRole('link', { name: 'upload-smoke.png' }).first();
  const linkVisible = await link.isVisible().catch(() => false);
  check('The uploaded file appears as a link on the page', linkVisible);

  if (linkVisible) {
    const href = await link.getAttribute('href');
    check(
      'The link points at the internal download route, not a raw storage key',
      href?.startsWith('/api/attachments/') ?? false,
      href ?? '',
    );

    const downloadResponse = await context.request
      .get(new URL(href, BASE).toString(), { maxRedirects: 0 })
      .catch((e) => e);
    // Expect a redirect (3xx) to a presigned MinIO URL - not a direct 200 with a raw key exposed.
    const status = downloadResponse?.status?.() ?? downloadResponse?.status;
    check(
      'The download route redirects to a presigned URL',
      status >= 300 && status < 400,
      String(status),
    );
  }
} catch (error) {
  check('smoke run completed without throwing', false, error.message);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed > 0 ? 1 : 0);
