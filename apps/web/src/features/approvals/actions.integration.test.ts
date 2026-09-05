import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { setAccessStatusAction, setAssetStatusAction } from '@/features/checklists/actions';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { decideApprovalAction, decideHandoffAction, submitHandoffAction } from './actions';

/**
 * `unmetHandoffRequirements` is the product rule behind "Submit to SHOPLINE":
 * migration, design, development, QA, merchant approval, blockers, access and
 * assets are all checked server-side before anything is sent. This exercises
 * the gate closed, then satisfies every requirement one at a time and proves
 * it opens - through the real `submitHandoffAction`, not a copy of its logic.
 */
describe('SHOPLINE handoff readiness', () => {
  let pm: TestUser;
  let dev: TestUser;
  let am: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    dev = await createTestUser('AHN_DEVELOPER');
    am = await createTestUser('SHOPLINE_ACCOUNT_MANAGER');

    const project = await createTestProject({
      as: pm,
      ahnProjectManagerId: pm.id,
      ahnDeveloperId: dev.id,
      shoplineAmId: am.id,
    });
    projectCode = project.code;
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('refuses a developer, who has no handoff:submit permission', async () => {
    await signInAs(dev);
    const result = await submitHandoffAction({
      code: projectCode,
      deploymentNotes: 'Should never reach the precondition check.',
      confirm: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('refuses submission on a freshly created project and names what is missing', async () => {
    await signInAs(pm);
    const result = await submitHandoffAction({
      code: projectCode,
      deploymentNotes: 'Nothing has been approved yet.',
      confirm: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PRECONDITION_FAILED');

    const unmet = result.fieldErrors?.__unmet ?? [];
    expect(unmet.length).toBeGreaterThan(0);
    expect(unmet.some((reason) => reason.includes('Design'))).toBe(true);
    expect(unmet.some((reason) => reason.includes('QA'))).toBe(true);
    expect(unmet.some((reason) => reason.includes('merchant'))).toBe(true);
    expect(unmet.some((reason) => reason.includes('access'))).toBe(true);
    expect(unmet.some((reason) => reason.includes('asset'))).toBe(true);

    // Refused before anything was written.
    const stage = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { stage: true },
    });
    expect(stage.stage).toBe('INTRODUCTION');
  });

  it('opens once every requirement is satisfied, and not a step before', async () => {
    await signInAs(pm);

    // Three of the four checkpoints an AHN project manager may decide alone.
    for (const type of ['DESIGN', 'DEVELOPMENT', 'QA'] as const) {
      const result = await decideApprovalAction({ code: projectCode, type, decision: 'APPROVED' });
      expect(result.ok).toBe(true);
    }

    // Still missing: merchant approval, access, assets. Confirm the gate holds.
    const stillBlocked = await submitHandoffAction({
      code: projectCode,
      deploymentNotes: 'Design, dev and QA are approved; nothing else is yet.',
      confirm: true,
    });
    expect(stillBlocked.ok).toBe(false);
    if (!stillBlocked.ok) {
      const unmet = stillBlocked.fieldErrors?.__unmet ?? [];
      expect(unmet.some((reason) => reason.includes('Design'))).toBe(false);
      expect(unmet.some((reason) => reason.includes('merchant'))).toBe(true);
    }

    // A PM may record the merchant's decision - it arrives by email or on a call.
    const merchantApproval = await decideApprovalAction({
      code: projectCode,
      type: 'MERCHANT_FINAL',
      decision: 'APPROVED',
    });
    expect(merchantApproval.ok).toBe(true);

    const blockingAccess = await db.accessItem.findMany({ where: { projectId, blocking: true } });
    expect(blockingAccess.length).toBeGreaterThan(0);
    for (const item of blockingAccess) {
      const result = await setAccessStatusAction({
        code: projectCode,
        itemId: item.id,
        status: 'VERIFIED',
      });
      expect(result.ok).toBe(true);
    }

    const requiredAssets = await db.assetItem.findMany({ where: { projectId, required: true } });
    expect(requiredAssets.length).toBeGreaterThan(0);
    for (const item of requiredAssets) {
      const result = await setAssetStatusAction({
        code: projectCode,
        itemId: item.id,
        status: 'APPROVED',
      });
      expect(result.ok).toBe(true);
    }

    const ready = await submitHandoffAction({
      code: projectCode,
      deploymentNotes: 'DNS cutover at 02:00 UTC. Rollback: old store stays live for 48h.',
      confirm: true,
    });
    expect(ready.ok).toBe(true);

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.stage).toBe('READY_FOR_SHOPLINE_REVIEW');

    const handoff = await db.handoffSubmission.findFirstOrThrow({ where: { projectId } });
    expect(handoff.decision).toBe('PENDING');
    expect(handoff.checklist).toBeTruthy();

    const deploymentApproval = await db.approval.findFirstOrThrow({
      where: { projectId, type: 'SHOPLINE_DEPLOYMENT' },
    });
    expect(deploymentApproval.status).toBe('PENDING');
  });

  it('SHOPLINE approving the handoff moves the project to Ready for Deployment', async () => {
    const handoff = await db.handoffSubmission.findFirstOrThrow({
      where: { projectId, decision: 'PENDING' },
    });

    await signInAs(am);
    const result = await decideHandoffAction({
      code: projectCode,
      handoffId: handoff.id,
      decision: 'APPROVED',
    });
    expect(result.ok).toBe(true);

    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.stage).toBe('READY_FOR_DEPLOYMENT');

    const decided = await db.handoffSubmission.findUniqueOrThrow({ where: { id: handoff.id } });
    expect(decided.decision).toBe('APPROVED');
    expect(decided.decidedById).toBe(am.id);

    const deploymentApproval = await db.approval.findFirstOrThrow({
      where: { projectId, type: 'SHOPLINE_DEPLOYMENT' },
    });
    expect(deploymentApproval.status).toBe('APPROVED');
  });
});
