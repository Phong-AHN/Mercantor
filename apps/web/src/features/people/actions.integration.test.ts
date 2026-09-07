import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { cleanupFixtures, createTestUser, signInAs, type TestUser } from '../../../test/fixtures';
import { inviteUserAction } from './actions';

/**
 * D-051: the first of the two gaps `FUTURE-WORK.md` §1 named - nothing
 * before this ever created a `User` row except `pnpm db:seed`. Deliberately
 * gated tighter than the rest of what `AHN_ADMIN`/`SHOPLINE_ADMIN` can do:
 * `MERCHANT` and `PLATFORM_ADMIN` are refused by the schema itself, not just
 * by convention (see the action's own comment for why).
 */
describe('inviteUserAction', () => {
  let admin: TestUser;
  let developer: TestUser;
  const inviteeIds: string[] = [];

  afterAll(async () => {
    if (inviteeIds.length > 0) {
      await db.passwordToken.deleteMany({ where: { userId: { in: inviteeIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: inviteeIds } } });
      await db.user.deleteMany({ where: { id: { in: inviteeIds } } });
    }
    await cleanupFixtures();
  });

  it('is refused for a role without user:manage', async () => {
    developer = await createTestUser('AHN_DEVELOPER');
    await signInAs(developer);

    const result = await inviteUserAction({
      email: `invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'AHN_PROJECT_MANAGER',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses MERCHANT and PLATFORM_ADMIN at the schema level, not just by convention', async () => {
    admin = await createTestUser('AHN_ADMIN');
    await signInAs(admin);

    const asMerchant = await inviteUserAction({
      email: `invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'MERCHANT' as never,
    });
    expect(asMerchant.ok).toBe(false);

    const asPlatformAdmin = await inviteUserAction({
      email: `invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'PLATFORM_ADMIN' as never,
    });
    expect(asPlatformAdmin.ok).toBe(false);
  });

  it('creates the account, derives team from role, and the account cannot sign in until the invite is used', async () => {
    const email = `invitee-${Date.now()}@relay.test`;
    const result = await inviteUserAction({
      email,
      name: 'Priya New',
      role: 'SHOPLINE_ACCOUNT_MANAGER',
      title: 'Account Manager',
    });
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(user.id);
    expect(user.role).toBe('SHOPLINE_ACCOUNT_MANAGER');
    expect(user.team).toBe('SHOPLINE');
    expect(user.isActive).toBe(true);

    const token = await db.passwordToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'INVITE' },
    });
    expect(token.usedAt).toBeNull();
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('is refused for an email that already has an active account', async () => {
    const email = `invitee-${Date.now()}@relay.test`;
    const first = await inviteUserAction({ email, name: 'First', role: 'AHN_DEVELOPER' });
    expect(first.ok).toBe(true);
    const created = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(created.id);

    const second = await inviteUserAction({ email, name: 'Second', role: 'AHN_DEVELOPER' });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.fieldErrors?.email).toBeTruthy();
  });
});
