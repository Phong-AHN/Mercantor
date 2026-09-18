import { afterAll, describe, expect, it } from 'vitest';
import { clock } from '@relay/core';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestOrganization,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import {
  inviteUserAction,
  platformInviteUserAction,
  platformResendInviteAction,
  platformSetUserActiveAction,
  platformUpdateUserAction,
  removeOrgUserAction,
  updateOrgUserRoleAction,
} from './actions';

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

  it('invites an AHN_DESIGNER with full AHN-team access, same as AHN_PROJECT_MANAGER', async () => {
    const email = `invitee-${Date.now()}@relay.test`;
    const result = await inviteUserAction({
      email,
      name: 'Dana Designer',
      role: 'AHN_DESIGNER',
      title: 'Design Lead',
    });
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(user.id);
    expect(user.role).toBe('AHN_DESIGNER');
    // Same team as every other AHN role, not a separate one - RBAC (comment
    // visibility, project scoping) treats AHN_DESIGNER identically to
    // AHN_PROJECT_MANAGER. It gets its own card only on the People page,
    // a display-only grouping keyed off role, not this column.
    expect(user.team).toBe('AHN');
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

/**
 * The `/people` counterpart to `inviteUserAction`'s "create" - editing a
 * role, scoped to the caller's own organization. Never lets one
 * organization's admin touch another organization's staff.
 */
describe('updateOrgUserRoleAction', () => {
  let orgAAdmin: TestUser;
  let orgAMember: TestUser;
  let orgBMember: TestUser;
  let merchant: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused for a role without user:manage', async () => {
    const developer = await createTestUser('AHN_DEVELOPER');
    orgAMember = await createTestUser('AHN_DEVELOPER', { organizationId: developer.organizationId });
    await signInAs(developer);

    const result = await updateOrgUserRoleAction({
      userId: orgAMember.id,
      role: 'AHN_PROJECT_MANAGER',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it("refuses to change the caller's own role", async () => {
    orgAAdmin = await createTestUser('AHN_ADMIN');
    await signInAs(orgAAdmin);

    const result = await updateOrgUserRoleAction({ userId: orgAAdmin.id, role: 'AHN_DEVELOPER' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses to edit a MERCHANT account', async () => {
    merchant = await createTestUser('MERCHANT');
    const result = await updateOrgUserRoleAction({ userId: merchant.id, role: 'AHN_DEVELOPER' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it("refuses to touch another organization's staff", async () => {
    const otherOrg = await createTestOrganization();
    orgBMember = await createTestUser('AHN_DEVELOPER', { organizationId: otherOrg.id });

    const result = await updateOrgUserRoleAction({ userId: orgBMember.id, role: 'AHN_PROJECT_MANAGER' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');

    const unchanged = await db.user.findUniqueOrThrow({ where: { id: orgBMember.id } });
    expect(unchanged.role).toBe('AHN_DEVELOPER');
  });

  it('updates a role and title within the same organization', async () => {
    // orgAAdmin and orgAMember both landed in the shared default test
    // organization (neither passed an explicit one), so this is a
    // same-organization edit.
    await signInAs(orgAAdmin);

    const result = await updateOrgUserRoleAction({
      userId: orgAMember.id,
      role: 'AHN_PROJECT_MANAGER',
      title: 'Delivery Lead',
    });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: orgAMember.id } });
    expect(updated.role).toBe('AHN_PROJECT_MANAGER');
    expect(updated.team).toBe('AHN');
    expect(updated.title).toBe('Delivery Lead');
  });
});

/**
 * The `/people` counterpart to `updateOrgUserRoleAction`, from the other
 * direction - gated by its own `user:remove` permission rather than
 * `user:manage`, so the two really are independently grantable, not just
 * granted together by coincidence in today's matrix.
 */
describe('removeOrgUserAction', () => {
  let orgAAdmin: TestUser;
  let orgAMember: TestUser;
  let orgBMember: TestUser;
  let merchant: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused for a role without user:remove', async () => {
    const developer = await createTestUser('AHN_DEVELOPER');
    orgAMember = await createTestUser('AHN_DEVELOPER', { organizationId: developer.organizationId });
    await signInAs(developer);

    const result = await removeOrgUserAction({ userId: orgAMember.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it("refuses to remove the caller's own account", async () => {
    orgAAdmin = await createTestUser('AHN_ADMIN');
    await signInAs(orgAAdmin);

    const result = await removeOrgUserAction({ userId: orgAAdmin.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses to remove a MERCHANT account', async () => {
    merchant = await createTestUser('MERCHANT');
    const result = await removeOrgUserAction({ userId: merchant.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it("refuses to remove another organization's staff", async () => {
    const otherOrg = await createTestOrganization();
    orgBMember = await createTestUser('AHN_DEVELOPER', { organizationId: otherOrg.id });

    const result = await removeOrgUserAction({ userId: orgBMember.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');

    const unchanged = await db.user.findUniqueOrThrow({ where: { id: orgBMember.id } });
    expect(unchanged.deletedAt).toBeNull();
  });

  it('soft-deletes a member within the same organization and revokes their live sessions', async () => {
    // orgAAdmin and orgAMember both landed in the shared default test
    // organization (neither passed an explicit one), so this is a
    // same-organization removal.
    await signInAs(orgAMember);
    const activeSession = await db.session.findFirstOrThrow({
      where: { userId: orgAMember.id, revokedAt: null },
    });

    await signInAs(orgAAdmin);
    const result = await removeOrgUserAction({ userId: orgAMember.id });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: orgAMember.id } });
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.isActive).toBe(false);

    const revoked = await db.session.findUniqueOrThrow({ where: { id: activeSession.id } });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('refuses to remove an account that is already removed', async () => {
    const result = await removeOrgUserAction({ userId: orgAMember.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });

  it('re-inviting the same email reactivates the removed account, same as before removal existed', async () => {
    const removed = await db.user.findUniqueOrThrow({ where: { id: orgAMember.id } });

    const result = await inviteUserAction({
      email: removed.email,
      name: 'Reinstated Member',
      role: 'AHN_PROJECT_MANAGER',
    });
    expect(result.ok).toBe(true);

    const reactivated = await db.user.findUniqueOrThrow({ where: { id: orgAMember.id } });
    expect(reactivated.deletedAt).toBeNull();
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.role).toBe('AHN_PROJECT_MANAGER');
    expect(reactivated.name).toBe('Reinstated Member');
  });
});

/**
 * The `/admin/platform` counterpart - PLATFORM_ADMIN has no organization of
 * its own, so an org must be chosen explicitly, and unlike `inviteUserAction`
 * this one *does* allow granting PLATFORM_ADMIN, gated behind `platform:manage`
 * rather than the much more widely held `user:manage`.
 */
describe('platformInviteUserAction', () => {
  let platformAdmin: TestUser;
  let orgAdmin: TestUser;
  let organizationId: string;
  const inviteeIds: string[] = [];

  afterAll(async () => {
    if (inviteeIds.length > 0) {
      await db.passwordToken.deleteMany({ where: { userId: { in: inviteeIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: inviteeIds } } });
      await db.user.deleteMany({ where: { id: { in: inviteeIds } } });
    }
    await cleanupFixtures();
  });

  it('is refused for a role without platform:manage, even AHN_ADMIN', async () => {
    orgAdmin = await createTestUser('AHN_ADMIN');
    await signInAs(orgAdmin);

    const result = await platformInviteUserAction({
      email: `platform-invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'AHN_PROJECT_MANAGER',
      organizationId: orgAdmin.organizationId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('requires an organization for every role except PLATFORM_ADMIN', async () => {
    platformAdmin = await createTestUser('PLATFORM_ADMIN');
    await signInAs(platformAdmin);

    const noOrg = await platformInviteUserAction({
      email: `platform-invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'SHOPLINE_ADMIN',
      organizationId: null,
    });
    expect(noOrg.ok).toBe(false);
    if (noOrg.ok) throw new Error('unreachable');
    expect(noOrg.fieldErrors?.organizationId).toBeTruthy();
  });

  it('refuses an organization for PLATFORM_ADMIN', async () => {
    const org = await createTestOrganization();

    const result = await platformInviteUserAction({
      email: `platform-invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'PLATFORM_ADMIN',
      organizationId: org.id,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.organizationId).toBeTruthy();
  });

  it('refuses an organization id that does not exist', async () => {
    const result = await platformInviteUserAction({
      email: `platform-invitee-${Date.now()}@relay.test`,
      name: 'Someone New',
      role: 'AHN_ADMIN',
      organizationId: '01a00000-0000-7000-8000-000000000000',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.organizationId).toBeTruthy();
  });

  it('creates a staff account in the chosen organization', async () => {
    const org = await createTestOrganization();
    organizationId = org.id;
    const email = `platform-invitee-${Date.now()}@relay.test`;

    const result = await platformInviteUserAction({
      email,
      name: 'New Org Admin',
      role: 'SHOPLINE_ADMIN',
      organizationId,
    });
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(user.id);
    expect(user.role).toBe('SHOPLINE_ADMIN');
    expect(user.team).toBe('SHOPLINE');
    expect(user.organizationId).toBe(organizationId);

    const token = await db.passwordToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'INVITE' },
    });
    expect(token.usedAt).toBeNull();
  });

  it('creates a PLATFORM_ADMIN account with no organization', async () => {
    const email = `platform-invitee-${Date.now()}@relay.test`;

    const result = await platformInviteUserAction({
      email,
      name: 'New Platform Admin',
      role: 'PLATFORM_ADMIN',
      organizationId: null,
    });
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(user.id);
    expect(user.role).toBe('PLATFORM_ADMIN');
    expect(user.organizationId).toBeNull();
  });
});

/**
 * The "manage" half of platform-wide account administration -
 * `platformInviteUserAction` above is the "create" half. Every action here
 * is gated the same way (`platform:manage`) and refuses to touch the
 * caller's own account, so a `PLATFORM_ADMIN` cannot lock themselves out.
 */
describe('platformUpdateUserAction', () => {
  let platformAdmin: TestUser;
  let target: TestUser;
  let orgA: { id: string };
  let orgB: { id: string };

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused for a role without platform:manage', async () => {
    const orgAdmin = await createTestUser('AHN_ADMIN');
    await signInAs(orgAdmin);

    const result = await platformUpdateUserAction({
      userId: orgAdmin.id,
      role: 'AHN_PROJECT_MANAGER',
      organizationId: orgAdmin.organizationId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses to change the caller\'s own role', async () => {
    platformAdmin = await createTestUser('PLATFORM_ADMIN');
    await signInAs(platformAdmin);

    const result = await platformUpdateUserAction({
      userId: platformAdmin.id,
      role: 'AHN_ADMIN',
      organizationId: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses to edit a MERCHANT account', async () => {
    const merchant = await createTestUser('MERCHANT');
    const result = await platformUpdateUserAction({
      userId: merchant.id,
      role: 'AHN_DEVELOPER',
      organizationId: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('moves a staff account to a different organization and role', async () => {
    orgA = await createTestOrganization();
    orgB = await createTestOrganization();
    target = await createTestUser('AHN_DEVELOPER', { organizationId: orgA.id });

    const result = await platformUpdateUserAction({
      userId: target.id,
      role: 'SHOPLINE_ACCOUNT_MANAGER',
      organizationId: orgB.id,
      title: 'Senior AM',
    });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe('SHOPLINE_ACCOUNT_MANAGER');
    expect(updated.team).toBe('SHOPLINE');
    expect(updated.organizationId).toBe(orgB.id);
    expect(updated.title).toBe('Senior AM');
  });

  it('promotes a staff account to PLATFORM_ADMIN, clearing its organization', async () => {
    const result = await platformUpdateUserAction({
      userId: target.id,
      role: 'PLATFORM_ADMIN',
      organizationId: null,
    });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe('PLATFORM_ADMIN');
    expect(updated.organizationId).toBeNull();
  });
});

describe('platformSetUserActiveAction', () => {
  let platformAdmin: TestUser;
  let target: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is refused on the caller\'s own account', async () => {
    platformAdmin = await createTestUser('PLATFORM_ADMIN');
    await signInAs(platformAdmin);

    const result = await platformSetUserActiveAction({ userId: platformAdmin.id, isActive: false });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('deactivates an account and revokes its live sessions', async () => {
    target = await createTestUser('AHN_DEVELOPER');
    await signInAs(target);
    const activeSession = await db.session.findFirstOrThrow({
      where: { userId: target.id, revokedAt: null },
    });

    await signInAs(platformAdmin);
    const result = await platformSetUserActiveAction({ userId: target.id, isActive: false });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(false);

    const revoked = await db.session.findUniqueOrThrow({ where: { id: activeSession.id } });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('is a no-op, not an error, when already in the requested state', async () => {
    const result = await platformSetUserActiveAction({ userId: target.id, isActive: false });
    expect(result.ok).toBe(true);
  });

  it('reactivates the account', async () => {
    const result = await platformSetUserActiveAction({ userId: target.id, isActive: true });
    expect(result.ok).toBe(true);

    const updated = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(true);
  });
});

describe('platformResendInviteAction', () => {
  let platformAdmin: TestUser;

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses to send a link to a deactivated account', async () => {
    platformAdmin = await createTestUser('PLATFORM_ADMIN');
    await signInAs(platformAdmin);
    const deactivated = await createTestUser('AHN_DEVELOPER');
    await db.user.update({ where: { id: deactivated.id }, data: { isActive: false } });

    const result = await platformResendInviteAction({ userId: deactivated.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONFLICT');
  });

  it('sends an INVITE-purpose link to an account that has never signed in', async () => {
    const neverSignedIn = await createTestUser('AHN_DEVELOPER');

    const result = await platformResendInviteAction({ userId: neverSignedIn.id });
    expect(result.ok).toBe(true);

    const token = await db.passwordToken.findFirstOrThrow({
      where: { userId: neverSignedIn.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(token.purpose).toBe('INVITE');
  });

  it('sends a RESET-purpose link to an account that has already signed in', async () => {
    const returning = await createTestUser('AHN_DEVELOPER');
    await db.user.update({ where: { id: returning.id }, data: { lastLoginAt: clock.now() } });

    const result = await platformResendInviteAction({ userId: returning.id });
    expect(result.ok).toBe(true);

    const token = await db.passwordToken.findFirstOrThrow({
      where: { userId: returning.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(token.purpose).toBe('RESET');
  });
});
