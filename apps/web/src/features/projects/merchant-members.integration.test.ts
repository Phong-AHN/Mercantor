import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestOrganization,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { removeMerchantMemberAction, updateMerchantMemberAction } from './actions';

/**
 * Editing and removing the merchants on a project's portal - from that
 * project only, and never in a way that reaches another organization.
 */
describe('merchant members of a project', () => {
  let pm: TestUser;
  let developer: TestUser;
  let merchant: TestUser;
  let outsider: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    developer = await createTestUser('AHN_DEVELOPER');
    merchant = await createTestUser('MERCHANT');
    outsider = await createTestUser('MERCHANT');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });

    // The outsider is a merchant on a different project, not this one.
    const other = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    await db.projectMember.create({ data: { projectId: other.id, userId: outsider.id } });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('corrects the name and sign-in email, normalising the email', async () => {
    await signInAs(pm);
    const email = `Renamed-${Date.now()}@Relay.Test`;
    const result = await updateMerchantMemberAction({
      code: projectCode,
      userId: merchant.id,
      name: 'Renamed Owner',
      email,
    });
    expect(result.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });
    expect(user.name).toBe('Renamed Owner');
    expect(user.email).toBe(email.toLowerCase());
  });

  it('refuses an email another account already uses', async () => {
    await signInAs(pm);
    const result = await updateMerchantMemberAction({
      code: projectCode,
      userId: merchant.id,
      name: 'Renamed Owner',
      email: pm.email,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it('refuses a merchant who is not on this project', async () => {
    await signInAs(pm);
    const edit = await updateMerchantMemberAction({
      code: projectCode,
      userId: outsider.id,
      name: 'Hijack',
      email: `hijack-${Date.now()}@relay.test`,
    });
    const remove = await removeMerchantMemberAction({ code: projectCode, userId: outsider.id });
    expect(edit.ok).toBe(false);
    expect(remove.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: outsider.id } })).name).not.toBe(
      'Hijack',
    );
  });

  it('refuses a role without merchant:manage', async () => {
    await signInAs(developer);
    const result = await removeMerchantMemberAction({ code: projectCode, userId: merchant.id });
    expect(result.ok).toBe(false);
    expect(await db.projectMember.count({ where: { projectId, userId: merchant.id } })).toBe(1);
  });

  it("will not change an account another organization's project also uses", async () => {
    const otherOrg = await createTestOrganization();
    const otherPm = await createTestUser('AHN_PROJECT_MANAGER', { organizationId: otherOrg.id });
    const shared = await createTestUser('MERCHANT');
    const theirs = await createTestProject({ as: otherPm, ahnProjectManagerId: otherPm.id });
    await db.projectMember.create({ data: { projectId: theirs.id, userId: shared.id } });
    await db.projectMember.create({ data: { projectId, userId: shared.id } });

    await signInAs(pm);
    const result = await updateMerchantMemberAction({
      code: projectCode,
      userId: shared.id,
      name: 'Shared Merchant',
      email: `takeover-${Date.now()}@relay.test`,
    });
    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).email).toBe(
      shared.email,
    );

    // Removing it from this project is still this organization's call.
    const removed = await removeMerchantMemberAction({ code: projectCode, userId: shared.id });
    expect(removed.ok).toBe(true);
    expect(await db.projectMember.count({ where: { userId: shared.id } })).toBe(1);
  });

  it('removes the membership and keeps the account', async () => {
    await signInAs(pm);
    const result = await removeMerchantMemberAction({ code: projectCode, userId: merchant.id });
    expect(result.ok).toBe(true);
    expect(await db.projectMember.count({ where: { projectId, userId: merchant.id } })).toBe(0);
    const user = await db.user.findUniqueOrThrow({ where: { id: merchant.id } });
    expect(user.deletedAt).toBeNull();
    expect(
      await db.activityEvent.count({
        where: {
          projectId,
          type: 'ASSIGNMENT_CHANGED',
          summary: 'Renamed Owner removed from the merchant portal.',
        },
      }),
    ).toBe(1);
  });
});
