import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { decideApprovalAction, requestApprovalAction } from '@/features/approvals/actions';
import { approveRedirectMapAction, setAssetStatusAction } from '@/features/checklists/actions';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';

/**
 * The two decisions the portal hands the merchant: approving the redirect
 * list, and the go-live sign-off. Both are answers to something the team
 * shared or asked for - neither may be taken before that.
 */
describe('merchant portal decisions', () => {
  let pm: TestUser;
  let merchant: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    merchant = await createTestUser('MERCHANT');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await db.projectMember.create({ data: { projectId, userId: merchant.id } });
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  describe('redirect list', () => {
    let redirectId: string;

    beforeAll(async () => {
      const item = await db.assetItem.findFirstOrThrow({
        where: { projectId, kind: 'REDIRECT_MAP' },
        select: { id: true },
      });
      redirectId = item.id;
    });

    it('cannot be approved before the team has shared it', async () => {
      await signInAs(merchant);
      const result = await approveRedirectMapAction({ code: projectCode, itemId: redirectId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('CONFLICT');
    });

    it('is not a way to approve any other file', async () => {
      const logo = await db.assetItem.findFirstOrThrow({
        where: { projectId, kind: { not: 'REDIRECT_MAP' } },
        select: { id: true },
      });
      await signInAs(merchant);
      const result = await approveRedirectMapAction({ code: projectCode, itemId: logo.id });
      expect(result.ok).toBe(false);
      const after = await db.assetItem.findUniqueOrThrow({ where: { id: logo.id } });
      expect(after.status).not.toBe('APPROVED');
    });

    it('is approved by the merchant once shared, and the project manager hears about it', async () => {
      await signInAs(pm);
      const shared = await setAssetStatusAction({
        code: projectCode,
        itemId: redirectId,
        status: 'RECEIVED',
      });
      expect(shared.ok).toBe(true);

      await signInAs(merchant);
      const result = await approveRedirectMapAction({ code: projectCode, itemId: redirectId });
      expect(result.ok).toBe(true);

      const item = await db.assetItem.findUniqueOrThrow({ where: { id: redirectId } });
      expect(item.status).toBe('APPROVED');
      expect(item.approvedAt).not.toBeNull();

      const notified = await db.notification.findMany({
        where: { userId: pm.id, projectId, type: 'MERCHANT_FEEDBACK' },
      });
      expect(notified.some((row) => row.title.includes('redirect list'))).toBe(true);
    });

    it('cannot be approved twice', async () => {
      await signInAs(merchant);
      const result = await approveRedirectMapAction({ code: projectCode, itemId: redirectId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('CONFLICT');
    });
  });

  describe('go-live sign-off', () => {
    it('is refused while the team has not asked for it', async () => {
      await signInAs(merchant);
      const result = await decideApprovalAction({
        code: projectCode,
        type: 'MERCHANT_FINAL',
        decision: 'APPROVED',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('CONFLICT');

      const approval = await db.approval.findUnique({
        where: { projectId_type: { projectId, type: 'MERCHANT_FINAL' } },
        select: { status: true },
      });
      expect(approval?.status).not.toBe('APPROVED');
    });

    it('can be given by the merchant once requested', async () => {
      await signInAs(pm);
      const requested = await requestApprovalAction({ code: projectCode, type: 'MERCHANT_FINAL' });
      expect(requested.ok).toBe(true);

      await signInAs(merchant);
      const result = await decideApprovalAction({
        code: projectCode,
        type: 'MERCHANT_FINAL',
        decision: 'APPROVED',
      });
      expect(result.ok).toBe(true);
    });
  });
});
