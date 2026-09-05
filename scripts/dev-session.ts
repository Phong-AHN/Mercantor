/**
 * Development helper: mints a session cookie for a seeded account so the app
 * can be exercised from a script or curl without going through the form.
 * Never shipped to production - it is not part of any package's entry points.
 */
import { loadRootEnv } from '@relay/config';
import { createSession } from '@relay/auth';
import { db } from '@relay/db';

async function main() {
  loadRootEnv();
  const email = process.argv[2] ?? 'linh.tran@ahnmedia.example';
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const session = await createSession(user.id, {});
  console.log(session.token);
  await db.$disconnect();
}

void main();
