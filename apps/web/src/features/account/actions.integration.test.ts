import { afterAll, describe, expect, it } from 'vitest';
import { createPasswordToken, verifyPassword } from '@relay/auth';
import { db } from '@relay/db';
import { cleanupFixtures, createTestUser, signOut, type TestUser } from '../../../test/fixtures';
import { requestPasswordResetAction, setPasswordAction } from './actions';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/**
 * Both run signed out, like `signInAction` - there is no principal for
 * `defineAction` to resolve yet. `setPasswordAction` ends in `redirect('/')`
 * on success, which the integration harness's `next/navigation` mock turns
 * into a thrown error (see `test/integration-setup.ts`) - a deliberate
 * "unexpected redirect" guard elsewhere, and exactly the signal this test
 * uses to know the action got as far as issuing a session.
 */
describe('requestPasswordResetAction', () => {
  let user: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('always returns the same generic message, whether or not the email exists', async () => {
    await signOut();
    user = await createTestUser('AHN_PROJECT_MANAGER');

    const forReal = await requestPasswordResetAction(null, form({ email: user.email }));
    const forFake = await requestPasswordResetAction(
      null,
      form({ email: `nobody-${Date.now()}@relay.test` }),
    );

    expect(forReal.ok).toBe(true);
    expect(forFake.ok).toBe(true);
    if (forReal.ok && forFake.ok) expect(forReal.message).toBe(forFake.message);
  });

  it('issues a real, single-use RESET token for a real account', async () => {
    const token = await db.passwordToken.findFirst({
      where: { userId: user.id, purpose: 'RESET' },
      orderBy: { createdAt: 'desc' },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
  });
});

describe('setPasswordAction', () => {
  let user: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused for garbage input without ever touching the token table', async () => {
    await signOut();
    const result = await setPasswordAction(null, form({ token: '', password: 'x' }));
    expect(result.ok).toBe(false);
  });

  it('is refused for a password that fails the strength check, and the token stays unused', async () => {
    user = await createTestUser('AHN_DEVELOPER');
    const { token } = await createPasswordToken(user.id, 'INVITE');

    const result = await setPasswordAction(null, form({ token, password: 'short' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.password).toBeTruthy();

    const row = await db.passwordToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.usedAt).toBeNull();
  });

  it('sets the password, marks the token used, and cannot be used a second time', async () => {
    const { token } = await createPasswordToken(user.id, 'INVITE');
    const newPassword = 'a genuinely long passphrase 42';

    await expect(setPasswordAction(null, form({ token, password: newPassword }))).rejects.toThrow(
      /Unexpected redirect/,
    );

    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(newPassword, updated.passwordHash)).toBe(true);

    // This user already has an unused, never-consumed INVITE token from the
    // previous case (the weak-password attempt never got far enough to
    // consume it) - order by newest to check the one this test just used,
    // not that stale one.
    const spent = await db.passwordToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'INVITE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(spent.usedAt).not.toBeNull();

    // The same link a second time is refused, not silently re-applied.
    const reuse = await setPasswordAction(
      null,
      form({ token, password: 'a different long passphrase 7' }),
    );
    expect(reuse.ok).toBe(false);
  });

  it('a RESET token revokes the session that existed before it, even though the flow itself issues a fresh one', async () => {
    const another = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');
    const { createSession } = await import('@relay/auth');
    const priorSession = await createSession(another.id, {});
    const priorRow = await db.session.findFirstOrThrow({
      where: { userId: another.id },
      select: { id: true },
    });
    expect(priorSession.token).toBeTruthy();

    const { token } = await createPasswordToken(another.id, 'RESET');
    await expect(
      setPasswordAction(null, form({ token, password: 'yet another long passphrase 9' })),
    ).rejects.toThrow(/Unexpected redirect/);

    const revoked = await db.session.findUniqueOrThrow({ where: { id: priorRow.id } });
    expect(revoked.revokedAt).not.toBeNull();

    // The reset flow's own sign-in issues exactly one fresh, non-revoked
    // session - revoking "everything" does not mean the person is logged out
    // of the account they just finished resetting.
    const live = await db.session.count({ where: { userId: another.id, revokedAt: null } });
    expect(live).toBe(1);
  });
});
