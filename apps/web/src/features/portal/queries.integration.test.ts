import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
} from '../../../test/fixtures';
import { requirePrincipal } from '@/server/session';
import { findPortalProject, getPortalProject } from './queries';

/**
 * A merchant login can exist before anyone attaches it to a project. Every
 * portal page reads its project through `findPortalProject`, so this is the
 * one place that has to turn "no project" into a state rather than a crash.
 */
describe('findPortalProject', () => {
  afterAll(async () => {
    await cleanupFixtures();
  });

  it('is null for a merchant with no project, where getPortalProject throws', async () => {
    const merchant = await createTestUser('MERCHANT');
    await signInAs(merchant);
    const principal = await requirePrincipal();

    expect(await findPortalProject(principal)).toBeNull();
    await expect(getPortalProject(principal)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns the project once the merchant is a member', async () => {
    const pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const merchant = await createTestUser('MERCHANT');
    await db.projectMember.create({ data: { projectId: project.id, userId: merchant.id } });
    await signInAs(merchant);
    const principal = await requirePrincipal();

    expect((await findPortalProject(principal))?.code).toBe(project.code);
  });
});
