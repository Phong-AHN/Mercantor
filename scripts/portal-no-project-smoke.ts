/**
 * Browser smoke check: a merchant who is signed in but not attached to any
 * project can open every portal URL and gets the "no project yet" state on
 * each - not an error page.
 *
 * Creates a throwaway merchant in the LOCAL database, mints a session for
 * it, walks the portal, and deletes it again. Refuses to run against
 * anything but a localhost database.
 *
 * Run with the dev server and infra up: npx tsx scripts/portal-no-project-smoke.ts
 */
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { loadRootEnv } from '@relay/config';
import { createSession, SESSION_COOKIE } from '@relay/auth';
import { db } from '@relay/db';

const BASE = process.env.RELAY_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTAL_PATHS = [
  '/portal',
  '/portal/access',
  '/portal/assets',
  '/portal/approvals',
  '/portal/qa',
  '/portal/activity',
];

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

async function main() {
  loadRootEnv();
  const databaseHost = new URL(process.env.DATABASE_URL ?? 'postgresql://unset').hostname;
  if (databaseHost !== 'localhost' && databaseHost !== '127.0.0.1') {
    console.error(
      `Refusing to create a throwaway account on ${databaseHost}. Local database only.`,
    );
    process.exit(1);
  }

  const suffix = randomUUID().slice(0, 8);
  const merchant = await db.user.create({
    data: {
      email: `no-project-${suffix}@relay.test`,
      name: 'Smoke Merchant',
      // Never signed in with a password - the session below is minted directly.
      passwordHash: 'unusable',
      role: 'MERCHANT',
      team: 'MERCHANT',
    },
    select: { id: true },
  });

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const session = await createSession(merchant.id, {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    context.setDefaultTimeout(120000);
    await context.addCookies([
      { name: SESSION_COOKIE, value: session.token, url: BASE, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();

    for (const path of PORTAL_PATHS) {
      const response = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const status = response?.status() ?? 0;
      const stayed = new URL(page.url()).pathname === path;
      const explained = await page.getByText('No migration project yet').first().isVisible();
      check(
        `${path} shows the no-project state`,
        status === 200 && stayed && explained,
        `status ${status}${stayed ? '' : `, landed on ${page.url()}`}`,
      );
    }
    await context.close();
  } finally {
    await browser.close();
    await db.user.delete({ where: { id: merchant.id } });
    await db.$disconnect();
  }

  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
