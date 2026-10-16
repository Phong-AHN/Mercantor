import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { inviteMerchantAction, removeMerchantMemberAction } from '../projects/actions';
import { inviteUserAction, removeOrgUserAction } from './actions';

/**
 * Inviting someone again after they were removed - from a project, or from
 * the organization - lands on a usable account with the right role, and
 * never revives a removed account's old role or password.
 */
describe('inviting someone who was removed', () => {
  let admin: TestUser;
  let pm: TestUser;
  let projectA: { id: string; code: string };
  let projectB: { id: string; code: string };

  beforeAll(async () => {
    admin = await createTestUser('AHN_ADMIN');
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    projectA = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectB = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  async function removedMerchant() {
    const merchant = await createTestUser('MERCHANT');
    await db.projectMember.create({ data: { projectId: projectA.id, userId: merchant.id } });
    await signInAs(pm);
    expect(
      (await removeMerchantMemberAction({ code: projectA.code, userId: merchant.id })).ok,
    ).toBe(true);
    return merchant;
  }

  it('a removed merchant can be invited to another project, keeping their password', async () => {
    const merchant = await removedMerchant();
    const before = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });

    const result = await inviteMerchantAction({
      code: projectB.code,
      name: merchant.name,
      email: merchant.email.toUpperCase(),
    });
    expect(result.ok).toBe(true);
    expect(
      await db.projectMember.count({ where: { projectId: projectB.id, userId: merchant.id } }),
    ).toBe(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.role).toBe('MERCHANT');
  });

  it('a merchant with no project left can be invited as staff', async () => {
    const merchant = await removedMerchant();
    await db.session.create({
      data: {
        userId: merchant.id,
        tokenHash: `reinvite-${merchant.id}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });

    await signInAs(admin);
    const result = await inviteUserAction({
      email: merchant.email,
      name: 'Now Staff',
      role: 'SHOPLINE_ACCOUNT_MANAGER',
    });
    expect(result.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });
    expect(after).toMatchObject({
      role: 'SHOPLINE_ACCOUNT_MANAGER',
      team: 'SHOPLINE',
      name: 'Now Staff',
    });
    expect(after.organizationId).toBe(admin.organizationId);
    // The old merchant password and sessions no longer work.
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await db.session.count({ where: { userId: merchant.id, revokedAt: null } })).toBe(0);
  });

  it('a merchant still on a project is not converted, and is told where to go instead', async () => {
    const merchant = await createTestUser('MERCHANT');
    await db.projectMember.create({ data: { projectId: projectA.id, userId: merchant.id } });

    await signInAs(admin);
    const result = await inviteUserAction({
      email: merchant.email,
      name: 'Should Not Change',
      role: 'AHN_DEVELOPER',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.email?.[0]).toMatch(/Merchant portal access/);
    expect((await db.user.findUniqueOrThrow({ where: { id: merchant.id } })).role).toBe('MERCHANT');
  });

  it('a removed staff member invited as a merchant comes back as a merchant, not with their old role', async () => {
    const developer = await createTestUser('AHN_DEVELOPER');
    await signInAs(admin);
    expect((await removeOrgUserAction({ userId: developer.id })).ok).toBe(true);
    const before = await db.user.findUniqueOrThrow({ where: { id: developer.id } });

    await signInAs(pm);
    const result = await inviteMerchantAction({
      code: projectA.code,
      name: 'Former Developer',
      email: developer.email,
    });
    expect(result.ok).toBe(true);

    const after = await db.user.findUniqueOrThrow({ where: { id: developer.id } });
    expect(after).toMatchObject({
      role: 'MERCHANT',
      team: 'MERCHANT',
      organizationId: null,
      deletedAt: null,
    });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(
      await db.projectMember.count({ where: { projectId: projectA.id, userId: developer.id } }),
    ).toBe(1);
  });

  it('an active staff email still cannot be invited as a merchant', async () => {
    await signInAs(pm);
    const result = await inviteMerchantAction({
      code: projectA.code,
      name: 'Staff',
      email: admin.email,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.email?.[0]).toMatch(/staff account/);
  });
});
