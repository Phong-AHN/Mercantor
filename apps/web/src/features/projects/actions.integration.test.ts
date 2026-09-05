import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { decideApprovalAction } from '@/features/approvals/actions';
import {
  cleanupFixtures,
  createTestProject,
  createTestUser,
  signInAs,
  type TestUser,
} from '../../../test/fixtures';
import { advanceStageAction } from './actions';

/**
 * Automated approvals (Phase 2): only the *request* step is automatic - the
 * decision always stays a person's call. Entering the stage where a
 * checkpoint becomes due requests it without anyone having to remember to
 * click "Request", the same way submitting the handoff package already
 * auto-requests `SHOPLINE_DEPLOYMENT`.
 */
describe('automated approval requests', () => {
  let pm: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await signInAs(pm);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  async function approvalOf(type: 'DESIGN' | 'DEVELOPMENT' | 'QA' | 'MERCHANT_FINAL') {
    return db.approval.findUnique({
      where: { projectId_type: { projectId, type } },
    });
  }

  it('entering Merchant Design Review requests DESIGN, attributed to nobody', async () => {
    const result = await advanceStageAction({ code: projectCode, to: 'MERCHANT_DESIGN_REVIEW' });
    expect(result.ok).toBe(true);

    const approval = await approvalOf('DESIGN');
    expect(approval?.status).toBe('PENDING');
    expect(approval?.requestedById).toBeNull();
    expect(approval?.requestedAt).not.toBeNull();
  });

  it('entering Internal QA requests DEVELOPMENT, and leaves DESIGN alone', async () => {
    const result = await advanceStageAction({ code: projectCode, to: 'INTERNAL_QA' });
    expect(result.ok).toBe(true);

    const development = await approvalOf('DEVELOPMENT');
    expect(development?.status).toBe('PENDING');
    expect(development?.requestedById).toBeNull();

    // Still PENDING from the previous transition - not touched a second time.
    const design = await approvalOf('DESIGN');
    expect(design?.status).toBe('PENDING');
  });

  it('entering Migration Validation requests both QA and MERCHANT_FINAL together', async () => {
    const result = await advanceStageAction({ code: projectCode, to: 'MIGRATION_VALIDATION' });
    expect(result.ok).toBe(true);

    const qa = await approvalOf('QA');
    const merchantFinal = await approvalOf('MERCHANT_FINAL');
    expect(qa?.status).toBe('PENDING');
    expect(merchantFinal?.status).toBe('PENDING');
  });

  it('never clobbers an approval that is already decided', async () => {
    const decided = await decideApprovalAction({
      code: projectCode,
      type: 'DESIGN',
      decision: 'APPROVED',
    });
    expect(decided.ok).toBe(true);

    // Move forward, then back to Merchant Design Review (order 8 is behind
    // Development's order 9, so this direction needs a reason too) - a real
    // rework loop, not a contrived one.
    await advanceStageAction({
      code: projectCode,
      to: 'DEVELOPMENT',
      reason: 'Reopening for an unrelated fix.',
    });
    await advanceStageAction({
      code: projectCode,
      to: 'MERCHANT_DESIGN_REVIEW',
      reason: 'Double-checking a design detail before continuing.',
    });

    const design = await approvalOf('DESIGN');
    expect(design?.status).toBe('APPROVED');
    expect(design?.decidedAt).not.toBeNull();
  });

  it('re-requests an approval that was sent back for changes', async () => {
    const changesRequested = await decideApprovalAction({
      code: projectCode,
      type: 'DEVELOPMENT',
      decision: 'CHANGES_REQUESTED',
      notes: 'The checkout flow regressed.',
    });
    expect(changesRequested.ok).toBe(true);

    let development = await approvalOf('DEVELOPMENT');
    expect(development?.status).toBe('CHANGES_REQUESTED');

    // Rework happens, and the project re-enters Internal QA.
    await advanceStageAction({
      code: projectCode,
      to: 'DEVELOPMENT',
      reason: 'Fixing the regression.',
    });
    await advanceStageAction({ code: projectCode, to: 'INTERNAL_QA' });

    development = await approvalOf('DEVELOPMENT');
    expect(development?.status).toBe('PENDING');
    expect(development?.requestedById).toBeNull();
    // Otherwise "The checkout flow regressed" would still show under the
    // new PENDING status, indistinguishable from a live note on this cycle.
    expect(development?.notes).toBeNull();
  });
});

/**
 * Formal SLA breach records (D-041): the worker's health sweep opens them
 * (covered by `apps/worker/src/processors/maintenance.integration.test.ts`
 * and `detectOpenBreaches` in `packages/core`), but `moveStage` is the one
 * place that closes a STAGE_OVERRUN breach the instant its stage is exited,
 * and a LAUNCH_OVERRUN one the instant the project completes - both exact,
 * known moments `moveStage` already has, not something worth a sweep to find.
 */
describe('SLA breach records close at the exact moment moveStage learns of them', () => {
  let pm: TestUser;
  let projectCode: string;
  let projectId: string;

  beforeAll(async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    const project = await createTestProject({ as: pm, ahnProjectManagerId: pm.id });
    projectCode = project.code;
    projectId = project.id;
    await signInAs(pm);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('closes an open STAGE_OVERRUN breach for the stage being left, and leaves other stages alone', async () => {
    const leaving = await db.slaBreach.create({
      data: {
        projectId,
        kind: 'STAGE_OVERRUN',
        stage: 'INTRODUCTION',
        targetDays: 3,
        startedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    });
    // A breach for a stage the project has not even reached yet - moving out
    // of INTRODUCTION must never touch this one.
    const unrelated = await db.slaBreach.create({
      data: {
        projectId,
        kind: 'STAGE_OVERRUN',
        stage: 'DEVELOPMENT',
        targetDays: 10,
        startedAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    });

    const result = await advanceStageAction({ code: projectCode, to: 'MERCHANT_CONTACTED' });
    expect(result.ok).toBe(true);

    const closed = await db.slaBreach.findUniqueOrThrow({ where: { id: leaving.id } });
    expect(closed.resolvedAt).not.toBeNull();

    const stillOpen = await db.slaBreach.findUniqueOrThrow({ where: { id: unrelated.id } });
    expect(stillOpen.resolvedAt).toBeNull();

    await db.slaBreach.delete({ where: { id: unrelated.id } });
  });

  it('closes an open LAUNCH_OVERRUN breach the moment the project reaches COMPLETED', async () => {
    const breach = await db.slaBreach.create({
      data: {
        projectId,
        kind: 'LAUNCH_OVERRUN',
        stage: null,
        targetDays: null,
        startedAt: new Date('2026-01-10T00:00:00.000Z'),
      },
    });

    // Forward jumps are legal without a reason; none of these three targets
    // trip the READY_FOR_SHOPLINE_REVIEW readiness gate.
    await advanceStageAction({ code: projectCode, to: 'READY_FOR_DEPLOYMENT' });
    await advanceStageAction({ code: projectCode, to: 'DEPLOYED_LIVE' });
    const result = await advanceStageAction({ code: projectCode, to: 'COMPLETED' });
    expect(result.ok).toBe(true);

    const closed = await db.slaBreach.findUniqueOrThrow({ where: { id: breach.id } });
    expect(closed.resolvedAt).not.toBeNull();
  });
});
