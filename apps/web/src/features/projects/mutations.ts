import 'server-only';
import { revalidatePath } from 'next/cache';
import {
  APPROVAL_TYPE_LABEL,
  clock,
  detectOpenBreaches,
  NotFoundError,
  STAGES,
  ValidationError,
  type ApprovalType,
  type ProjectStage,
  type Team,
} from '@relay/core';
import { assessHealth } from '@relay/core';
import { db, type DbTransaction, type Prisma } from '@relay/db';
import { projectScopeWhere, type Principal } from '@relay/rbac';
import { enqueue } from '@relay/queue';
import { logger } from '@relay/observability';
import { audit, notify, queueOutbox, recordActivity } from '@/server/record';
import { buildSnapshot } from './snapshot';

/**
 * Shared write-side helpers. Every mutation resolves its project through
 * `resolveProject`, which applies the same scope as the read side - so a
 * merchant cannot write to a project they cannot see, even with a valid id.
 */
export async function resolveProject(
  principal: Principal,
  code: string,
): Promise<{
  id: string;
  code: string;
  stage: ProjectStage;
  merchantName: string;
  currency: string;
}> {
  const project = await db.project.findFirst({
    where: { ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput), code },
    select: {
      id: true,
      code: true,
      stage: true,
      currency: true,
      merchant: { select: { name: true } },
    },
  });
  if (!project)
    throw new NotFoundError('That project does not exist, or it is not one you can see.');
  return {
    id: project.id,
    code: project.code,
    stage: project.stage,
    merchantName: project.merchant.name,
    currency: project.currency,
  };
}

/**
 * Recomputes the denormalised health and current-blocker columns from the rows
 * that justify them. Called inside the same transaction as whatever changed, so
 * the list view can never show a health the project no longer has.
 *
 * The same pass also reconciles `SlaBreach` (D-041) rows, for the same reason
 * health is recomputed both here and by the worker's 15-minute sweep: a
 * change that pushes a target date into the past should not have to wait for
 * the sweep to notice, any more than the health column should. Only opening
 * new breaches and resolving a launch breach whose date moved happen here -
 * closing a stage breach stays `moveStage`'s job exclusively, since it is the
 * one place that knows the exact instant a stage was actually left.
 */
export async function recomputeHealth(tx: DbTransaction, projectId: string): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      stage: true,
      startDate: true,
      targetLaunchDate: true,
      completedAt: true,
      lastActivityAt: true,
      contractTotalMinor: true,
      currency: true,
      stageEvents: { select: { stage: true, enteredAt: true, exitedAt: true, ownerTeam: true } },
      blockers: {
        select: {
          id: true,
          title: true,
          category: true,
          ownerTeam: true,
          startedAt: true,
          resolvedAt: true,
          ownerships: {
            select: { blockerId: true, ownerTeam: true, startedAt: true, endedAt: true },
          },
        },
      },
      issues: { select: { severity: true, status: true } },
      invoices: {
        select: { status: true, amountMinor: true, paidMinor: true, currency: true, dueDate: true },
      },
    },
  });
  if (!project) return;

  const openBlockers = project.blockers.filter((blocker) => blocker.resolvedAt === null);
  const snapshot = buildSnapshot({
    startDate: project.startDate,
    targetLaunchDate: project.targetLaunchDate,
    completedAt: project.completedAt,
    lastActivityAt: project.lastActivityAt,
    stage: project.stage,
    stageEvents: project.stageEvents,
    blockerOwnerships: project.blockers.flatMap((blocker) => blocker.ownerships),
    openBlockers,
    issues: project.issues,
    invoices: project.invoices,
    contractTotalMinor: project.contractTotalMinor,
    currency: project.currency,
  });

  // The oldest unresolved blocker is the one the product calls "current".
  const current =
    [...openBlockers].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0] ?? null;

  await tx.project.update({
    where: { id: projectId },
    data: { health: snapshot.health.health, currentBlockerId: current?.id ?? null },
  });

  // Skipped once COMPLETED, the same as the worker's sweep (`stage: { not:
  // 'COMPLETED' }`) - otherwise a project that finished late would have
  // `moveStage` close its launch breach and this reopen it in the same
  // transaction, since a completed project is still, correctly, over target.
  if (project.stage === 'COMPLETED') return;

  const detected = detectOpenBreaches(snapshot.time);
  const existingBreaches = await tx.slaBreach.findMany({
    where: { projectId, resolvedAt: null },
  });

  for (const breach of detected) {
    const alreadyOpen = existingBreaches.some(
      (row) => row.kind === breach.kind && row.stage === breach.stage,
    );
    if (alreadyOpen) continue;
    await tx.slaBreach.create({
      data: {
        projectId,
        kind: breach.kind,
        stage: breach.stage,
        targetDays: breach.targetDays,
        startedAt: breach.startedAt,
      },
    });
  }

  const launchStillOpen = detected.some((breach) => breach.kind === 'LAUNCH_OVERRUN');
  for (const row of existingBreaches) {
    if (row.kind === 'LAUNCH_OVERRUN' && !launchStillOpen) {
      // Never earlier than the row's own `startedAt` - the check constraint
      // enforces it, and clamping is more honest than crashing the mutation
      // over what can only be clock skew.
      const resolvedAt = row.startedAt > snapshot.time.now ? row.startedAt : snapshot.time.now;
      await tx.slaBreach.update({ where: { id: row.id }, data: { resolvedAt } });
    }
  }
}

/** Re-exported so callers do not have to reach into core for one function. */
export { assessHealth };

/**
 * Closes the open stage visit and opens a new one, caching the duration on the
 * closed row. The unique partial index guarantees only one visit is ever open.
 *
 * Also the only place a `SlaBreach` (D-041) closes for a reason other than a
 * pushed-back target date: leaving a stage is the exact, known instant a
 * stage-overrun breach stops applying, and reaching COMPLETED is the exact
 * instant a launch-overrun one does. Both are plain `updateMany` calls that
 * no-op harmlessly when nothing was open - there is nothing to look up first.
 */
export async function moveStage(
  tx: DbTransaction,
  input: {
    projectId: string;
    to: ProjectStage;
    changedById: string;
    reason?: string | null;
    ownerTeam?: Team | null;
  },
): Promise<void> {
  const now = clock.now();

  const open = await tx.stageEvent.findFirst({
    where: { projectId: input.projectId, exitedAt: null },
    select: { id: true, stage: true, enteredAt: true },
  });

  if (open) {
    await tx.stageEvent.update({
      where: { id: open.id },
      data: {
        exitedAt: now,
        durationMs: BigInt(Math.max(0, now.getTime() - open.enteredAt.getTime())),
      },
    });
    await tx.slaBreach.updateMany({
      where: {
        projectId: input.projectId,
        kind: 'STAGE_OVERRUN',
        stage: open.stage,
        resolvedAt: null,
      },
      data: { resolvedAt: now },
    });
  }

  if (input.to === 'COMPLETED') {
    await tx.slaBreach.updateMany({
      where: { projectId: input.projectId, kind: 'LAUNCH_OVERRUN', resolvedAt: null },
      data: { resolvedAt: now },
    });
  }

  await tx.stageEvent.create({
    data: {
      projectId: input.projectId,
      stage: input.to,
      enteredAt: now,
      ownerTeam: input.ownerTeam ?? null,
      changedById: input.changedById,
      reason: input.reason ?? null,
    },
  });

  await tx.project.update({
    where: { id: input.projectId },
    data: {
      stage: input.to,
      lastActivityAt: now,
      completedAt: input.to === 'COMPLETED' ? now : undefined,
      actualLaunchDate: input.to === 'DEPLOYED_LIVE' ? now : undefined,
    },
  });
}

export interface OutboundUpdate {
  projectId: string;
  projectCode: string;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  fields?: { label: string; value: string }[];
  /** ClickUp status to push, when the change is a stage move. */
  clickUpStage?: ProjectStage;
}

/**
 * Writes the outbox rows for an update in the same transaction as the change,
 * then nudges the worker. If Redis is down the rows still exist and the
 * two-minute retry sweep picks them up - an integration outage delays an
 * update, it never loses one.
 */
export async function fanOut(tx: DbTransaction, update: OutboundUpdate): Promise<string[]> {
  const links = await tx.integrationLink.findMany({
    where: { projectId: update.projectId, isActive: true },
    select: { provider: true, externalId: true },
  });

  const ids: string[] = [];
  for (const link of links) {
    if (link.provider === 'SLACK') {
      ids.push(
        await queueOutbox(tx, {
          projectId: update.projectId,
          provider: 'SLACK',
          kind: 'project_update',
          payload: {
            channelId: link.externalId,
            title: update.title,
            body: update.body ?? null,
            tone: update.tone,
            fields: update.fields ?? [],
            projectCode: update.projectCode,
          },
        }),
      );
    }
    if (link.provider === 'CLICKUP' && update.clickUpStage) {
      ids.push(
        await queueOutbox(tx, {
          projectId: update.projectId,
          provider: 'CLICKUP',
          kind: 'stage_sync',
          payload: {
            taskId: link.externalId,
            stage: update.clickUpStage,
            note: update.title,
          },
        }),
      );
    }
  }
  return ids;
}

/**
 * Some stage transitions mean a checkpoint is due for review, the same way
 * submitting the handoff package already auto-requests `SHOPLINE_DEPLOYMENT`
 * (see `submitHandoffAction`) rather than waiting for someone to click
 * "Request". This generalises that to the earlier checkpoints: entering
 * `MIGRATION_VALIDATION`, for instance, means QA is done and the merchant's
 * final sign-off is due, without anyone having to remember to ask for it.
 *
 * The decision itself is never automated - only the request. `requestedById`
 * is left `null` rather than attributed to whoever happened to move the
 * stage; nobody "requested" this, the stage change did.
 */
const AUTO_REQUEST_ON_ENTERING: Partial<Record<ProjectStage, readonly ApprovalType[]>> = {
  MERCHANT_DESIGN_REVIEW: ['DESIGN'],
  INTERNAL_QA: ['DEVELOPMENT'],
  MIGRATION_VALIDATION: ['QA', 'MERCHANT_FINAL'],
};

export async function autoRequestApprovals(
  tx: DbTransaction,
  input: { projectId: string; projectCode: string; merchantName: string; stage: ProjectStage },
): Promise<string[]> {
  const types = AUTO_REQUEST_ON_ENTERING[input.stage];
  if (!types || types.length === 0) return [];

  const now = clock.now();
  const outboxIds: string[] = [];

  for (const type of types) {
    const existing = await tx.approval.findUnique({
      where: { projectId_type: { projectId: input.projectId, type } },
      select: { status: true },
    });
    // A live request or an already-earned approval is never clobbered; a
    // rejection or a request for changes is exactly when this should fire
    // again, so re-entering the stage after rework re-requests it.
    if (existing && (existing.status === 'PENDING' || existing.status === 'APPROVED')) continue;

    await tx.approval.upsert({
      where: { projectId_type: { projectId: input.projectId, type } },
      create: { projectId: input.projectId, type, status: 'PENDING', requestedAt: now },
      update: {
        status: 'PENDING',
        requestedById: null,
        requestedAt: now,
        decidedById: null,
        decidedAt: null,
        // Otherwise a prior rejection's reason survives under the new
        // PENDING status, indistinguishable from a live comment on this cycle.
        notes: null,
      },
    });

    await recordActivity(tx, {
      projectId: input.projectId,
      type: 'APPROVAL_REQUESTED',
      actorId: null,
      summary: `${APPROVAL_TYPE_LABEL[type].label} requested automatically.`,
      detail: `Entering ${STAGES[input.stage].label} means this checkpoint is due.`,
      visibility: type === 'MERCHANT_FINAL' ? 'EVERYONE' : 'AHN_SHOPLINE',
    });

    await audit(tx, {
      principal: null,
      projectId: input.projectId,
      action: 'approval.auto_request',
      entityType: 'Approval',
      entityId: `${input.projectId}:${type}`,
      after: { type, status: 'PENDING' },
    });

    const watchers = await tx.project.findUnique({
      where: { id: input.projectId },
      select: {
        ahnProjectManagerId: true,
        shoplineAmId: true,
        shoplineSeId: true,
        members: { select: { userId: true } },
      },
    });

    const audience =
      type === 'SHOPLINE_DEPLOYMENT'
        ? [watchers?.shoplineAmId, watchers?.shoplineSeId]
        : type === 'MERCHANT_FINAL'
          ? (watchers?.members.map((member) => member.userId) ?? [])
          : [watchers?.ahnProjectManagerId];

    await notify(tx, {
      userIds: audience.filter((id): id is string => typeof id === 'string'),
      projectId: input.projectId,
      type: 'APPROVAL_PENDING',
      title: `${APPROVAL_TYPE_LABEL[type].label} needed on ${input.merchantName}`,
      body: `Entering ${STAGES[input.stage].label}.`,
      href: `/projects/${input.projectCode}/approvals`,
    });

    outboxIds.push(
      ...(await fanOut(tx, {
        projectId: input.projectId,
        projectCode: input.projectCode,
        title: `${APPROVAL_TYPE_LABEL[type].label} requested on ${input.merchantName}`,
        body: `Requested automatically - the project entered ${STAGES[input.stage].label}.`,
        tone: 'warning',
      })),
    );
  }

  return outboxIds;
}

/** Fire-and-forget nudge; failure here is logged and never surfaced. */
export async function nudgeWorker(outboxIds: readonly string[]): Promise<void> {
  for (const outboxId of outboxIds) {
    const queued = await enqueue('integrations', { outboxId });
    if (!queued) logger.warn({ outboxId }, 'integration nudge failed; the sweep will retry');
  }
}

/** A form date, or null. Rejects garbage rather than silently storing epoch 0. */
export function parseDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('That date is not valid.', { [field]: ['Use a real date.'] });
  }
  return parsed;
}

/** Every project mutation invalidates the same three surfaces. */
export function revalidateProject(code: string): void {
  revalidatePath(`/projects/${code}`, 'layout');
  revalidatePath('/projects');
  revalidatePath('/dashboard');
}

/**
 * What still stands between this project and a SHOPLINE handoff.
 *
 * Deliberately not exported from the `'use server'` module: every export there
 * becomes a callable endpoint, and this one takes a raw project id.
 */
export async function unmetHandoffRequirements(projectId: string): Promise<string[]> {
  const [openBlockers, launchBlockers, approvals, blockingAccess, requiredAssets] =
    await Promise.all([
      db.blocker.count({ where: { projectId, resolvedAt: null } }),
      db.issue.count({
        where: {
          projectId,
          severity: 'LAUNCH_BLOCKER',
          status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'] },
        },
      }),
      db.approval.findMany({ where: { projectId }, select: { type: true, status: true } }),
      db.accessItem.count({ where: { projectId, blocking: true, status: { not: 'VERIFIED' } } }),
      db.assetItem.count({
        where: { projectId, required: true, status: { in: ['NOT_REQUESTED', 'REQUESTED'] } },
      }),
    ]);

  const status = (type: string) =>
    approvals.find((a) => a.type === type)?.status ?? 'NOT_REQUESTED';
  const unmet: string[] = [];

  if (openBlockers > 0) unmet.push(`${openBlockers} blocker(s) still open.`);
  if (launchBlockers > 0) unmet.push(`${launchBlockers} launch-blocking issue(s) still open.`);
  if (status('DESIGN') !== 'APPROVED') unmet.push('Design has not been approved.');
  if (status('DEVELOPMENT') !== 'APPROVED') unmet.push('Development has not been approved.');
  if (status('QA') !== 'APPROVED') unmet.push('QA has not been approved.');
  if (status('MERCHANT_FINAL') !== 'APPROVED')
    unmet.push('The merchant has not given final approval.');
  if (blockingAccess > 0) unmet.push(`${blockingAccess} blocking access item(s) are not verified.`);
  if (requiredAssets > 0) unmet.push(`${requiredAssets} required asset(s) have not been received.`);

  return unmet;
}
