import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { inviteMerchantAction } from './actions';

/**
 * D-051: the second gap `FUTURE-WORK.md` §1 named - a merchant's portal
 * access is a real, enforced `ProjectMember` row (D-010), but nothing ever
 * created one outside `pnpm db:seed`. Gated by `merchant:manage`, which
 * `AHN_PROJECT_MANAGER` already holds and `AHN_DEVELOPER` does not - the
 * same split `introduction:send` already draws.
 */
describe('inviteMerchantAction', () => {
  let pm: TestUser;
  let developer: TestUser;
  let projectCode: string;
  let projectId: string;
  const inviteeIds: string[] = [];

  afterAll(async () => {
    if (inviteeIds.length > 0) {
      await db.passwordToken.deleteMany({ where: { userId: { in: inviteeIds } } });
      await db.projectMember.deleteMany({ where: { userId: { in: inviteeIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: inviteeIds } } });
      await db.user.deleteMany({ where: { id: { in: inviteeIds } } });
    }
    await cleanupFixtures();
  });

  it('is refused for a role without merchant:manage', async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    developer = await createTestUser('AHN_DEVELOPER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;

    await signInAs(developer);
    const result = await inviteMerchantAction({
      code: projectCode,
      name: 'Merchant Owner',
      email: `merchant-${Date.now()}@relay.test`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('FORBIDDEN');
  });

  it('creates a MERCHANT account and grants it access to exactly this project', async () => {
    await signInAs(pm);
    const email = `merchant-${Date.now()}@relay.test`;

    const result = await inviteMerchantAction({ code: projectCode, name: 'Merchant Owner', email });
    expect(result.ok).toBe(true);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(user.id);
    expect(user.role).toBe('MERCHANT');
    expect(user.team).toBe('MERCHANT');

    const membership = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    expect(membership).not.toBeNull();
  });

  it('re-inviting the same email to a second project grants access without a second account', async () => {
    await signInAs(pm);
    const email = `merchant-${Date.now()}@relay.test`;
    await inviteMerchantAction({ code: projectCode, name: 'Repeat Merchant', email });
    const firstUser = await db.user.findUniqueOrThrow({ where: { email } });
    inviteeIds.push(firstUser.id);

    const otherProject = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    const second = await inviteMerchantAction({
      code: otherProject.code,
      name: 'Repeat Merchant',
      email,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.message).toContain('now has access');

    const users = await db.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    const memberships = await db.projectMember.findMany({ where: { userId: firstUser.id } });
    expect(memberships).toHaveLength(2);
  });

  it('refuses an email that already belongs to a non-merchant account', async () => {
    const staff = await createTestUser('AHN_DEVELOPER');
    await signInAs(pm);

    const result = await inviteMerchantAction({
      code: projectCode,
      name: staff.name,
      email: staff.email,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.fieldErrors?.email).toBeTruthy();
  });
});
