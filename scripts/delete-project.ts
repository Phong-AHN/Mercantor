/**
 * Deletes one project by code, and everything that cascades from it
 * (scope/access/asset items, invoices, blockers, comments, the outbox...).
 * For cleaning up a throwaway project created while testing by hand or by a
 * smoke script - never point this at real data.
 *
 * Usage: ./node_modules/.bin/tsx scripts/delete-project.ts PRJ-0042
 */
import { loadRootEnv } from '@relay/config';
import { db } from '@relay/db';

async function main() {
  loadRootEnv();
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: ./node_modules/.bin/tsx scripts/delete-project.ts <project-code>');
    process.exit(1);
  }

  const project = await db.project.findUnique({
    where: { code },
    select: { id: true, merchantId: true },
  });
  if (!project) {
    console.error(`No project with code ${code}.`);
    process.exit(1);
  }

  await db.project.delete({ where: { id: project.id } });
  // Only if nothing else references this merchant - a real merchant with
  // other projects must survive.
  const remaining = await db.project.count({ where: { merchantId: project.merchantId } });
  if (remaining === 0) await db.merchant.delete({ where: { id: project.merchantId } });

  console.log(`Deleted ${code}.`);
  await db.$disconnect();
}

void main().then(() => process.exit(0));
