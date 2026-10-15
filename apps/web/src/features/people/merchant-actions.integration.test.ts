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
import { removeOrgMerchantAction, updateOrgMerchantAction } from './actions';

/**
 * Editing and removing a merchant from the People page: across every project
 * of the reader's organization, and never reaching another organization.
 */
describe('merchant rows on the People page', () => {
  let pm: TestUser;
  let developer: TestUser;
  let otherPm: TestUser;
  let merchant: TestUser;
  let shared: TestUser;
  let stranger: TestUser;
  let projectA: { id: string };
  let projectB: { id: string };
  let theirProject: { id: string };

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    developer = await createTestUser('AHN_DEVELOPER');
    merchant = await createTestUser('MERCHANT');
    shared = await createTestUser('MERCHANT');
    stranger = await createTestUser('MERCHANT');
    projectA = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectB = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });

    const otherOrg = await createTestOrganization();
    otherPm = await createTestUser('AHN_PROJECT_MANAGER', { organizationId: otherOrg.id });
    theirProject = await createTestProject({ as: otherPm, ahnProjectManagerId: otherPm.id });

    await db.projectMember.createMany({
      data: [
        { projectId: projectA.id, userId: merchant.id },
        { projectId: projectB.id, userId: merchant.id },
        { projectId: projectA.id, userId: shared.id },
        { projectId: theirProject.id, userId: shared.id },
        { projectId: theirProject.id, userId: stranger.id },
      ],
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('edits the name and sign-in email', async () => {
    await signInAs(pm);
    const email = `people-edit-${Date.now()}@relay.test`;
    const result = await updateOrgMerchantAction({
      userId: merchant.id,
      name: 'Edited Owner',
      email,
    });
    expect(result.ok).toBe(true);
    expect(await db.user.findUniqueOrThrow({ where: { id: merchant.id } })).toMatchObject({
      name: 'Edited Owner',
      email,
    });
  });

  it("refuses a merchant who is only on another organization's project", async () => {
    await signInAs(pm);
    const edit = await updateOrgMerchantAction({
      userId: stranger.id,
      name: 'Hijack',
      email: `hijack-${Date.now()}@relay.test`,
    });
    const remove = await removeOrgMerchantAction({ userId: stranger.id });
    expect(edit.ok).toBe(false);
    expect(remove.ok).toBe(false);
    expect(await db.projectMember.count({ where: { userId: stranger.id } })).toBe(1);
  });

  it('refuses to edit an account another organization also uses', async () => {
    await signInAs(pm);
    const result = await updateOrgMerchantAction({
      userId: shared.id,
      name: 'Shared',
      email: `takeover-${Date.now()}@relay.test`,
    });
    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).email).toBe(
      shared.email,
    );
  });

  it('refuses a role without merchant:manage', async () => {
    await signInAs(developer);
    expect((await removeOrgMerchantAction({ userId: merchant.id })).ok).toBe(false);
    expect(await db.projectMember.count({ where: { userId: merchant.id } })).toBe(2);
  });

  it("removes them from every one of this organization's projects, and only those", async () => {
    await signInAs(pm);
    expect((await removeOrgMerchantAction({ userId: merchant.id })).ok).toBe(true);
    expect(await db.projectMember.count({ where: { userId: merchant.id } })).toBe(0);
    expect(
      await db.activityEvent.count({
        where: {
          projectId: { in: [projectA.id, projectB.id] },
          summary: 'Edited Owner removed from the merchant portal.',
        },
      }),
    ).toBe(2);

    // A shared account keeps its other organization's project.
    expect((await removeOrgMerchantAction({ userId: shared.id })).ok).toBe(true);
    expect(await db.projectMember.findMany({ where: { userId: shared.id } })).toMatchObject([
      { projectId: theirProject.id },
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: shared.id } })).deletedAt).toBeNull();
  });
});
