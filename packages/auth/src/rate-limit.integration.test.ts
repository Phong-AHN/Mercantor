import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { checkSignInThrottle, clearSignInThrottle, recordSignInFailure } from './rate-limit';
import { hashPassword } from './password';
import { signIn } from './sign-in';

/**
 * D-051, closing the gap D-050 deliberately left open: keyed by IP, not by
 * account, so the delay only ever slows down the one source making the
 * attempts (see `SignInThrottle`'s own comment for why an account-keyed
 * lockout is itself a denial-of-service vector).
 */
describe('sign-in throttle', () => {
  afterEach(async () => {
    await db.signInThrottle.deleteMany({});
  });

  it('the first several failures from one IP are free - no delay', async () => {
    const ip = `test-${randomUUID()}`;
    for (let i = 0; i < 4; i += 1) {
      await checkSignInThrottle(ip); // must not throw
      await recordSignInFailure(ip);
    }
    await expect(checkSignInThrottle(ip)).resolves.toBeUndefined();
  });

  it('past the free threshold, the next attempt is refused until the delay elapses', async () => {
    const ip = `test-${randomUUID()}`;
    for (let i = 0; i < 5; i += 1) await recordSignInFailure(ip);

    await expect(checkSignInThrottle(ip)).rejects.toThrow(/wait a moment/i);

    // Backdating the last attempt simulates the delay having already
    // elapsed, without the test actually sleeping for it.
    await db.signInThrottle.update({
      where: { ip },
      data: { lastAttemptAt: new Date(Date.now() - 60_000) },
    });
    await expect(checkSignInThrottle(ip)).resolves.toBeUndefined();
  });

  it('a successful sign-in clears the throttle for that IP', async () => {
    const email = `it-throttle-${randomUUID().slice(0, 8)}@relay.test`;
    const password = 'a genuinely long passphrase for this test';
    const user = await db.user.create({
      data: {
        email,
        name: 'Throttle Test User',
        passwordHash: await hashPassword(password),
        role: 'AHN_DEVELOPER',
        team: 'AHN',
        isActive: true,
      },
    });

    try {
      // Below the free-attempts threshold, so this does not itself block the
      // sign-in below - what this proves is narrower: a row exists from
      // earlier misses, and a *successful* sign-in clears it rather than
      // leaving it to decay on its own.
      const ip = `test-${randomUUID()}`;
      await recordSignInFailure(ip);
      await recordSignInFailure(ip);
      const before = await db.signInThrottle.findUnique({ where: { ip } });
      expect(before?.failedAttempts).toBe(2);

      await signIn(email, password, { ip });

      const row = await db.signInThrottle.findUnique({ where: { ip } });
      expect(row).toBeNull();
    } finally {
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  it('clearSignInThrottle on an IP with no row is a harmless no-op', async () => {
    await expect(clearSignInThrottle(`test-${randomUUID()}`)).resolves.toBeUndefined();
  });
});
