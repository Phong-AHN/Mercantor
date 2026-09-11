import 'server-only';
import { revalidatePath } from 'next/cache';
import {
  APPROVAL_TYPE_LABEL,
  checkTransition,
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
import { db, transaction, type DbTransaction, type Prisma } from '@relay/db';
import { clickUpStatusForTrackedStage } from '@relay/integrations';
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
  organizationId: string;
  organizationName: string;
}> {
  const project = await db.project.findFirst({
    where: { ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput), code },
    select: {
      id: true,
      code: true,
      stage: true,
      currency: true,
      organizationId: true,
      organization: { select: { name: true } },
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
    organizationId: project.organizationId,
    organizationName: project.organization.name,
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

  // Only fetched when a ClickUp link actually needs it - most fan-outs are
  // Slack-only or have no ClickUp link at all.
  let trackedStages: ProjectStage[] | null = null;

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
      if (trackedStages === null) {
        const project = await tx.project.findUnique({
          where: { id: update.projectId },
          select: { clickUpTrackedStages: true },
        });
        trackedStages = project?.clickUpTrackedStages ?? [];
      }

      // A project that opted into precise two-way sync only ever pushes the
      // stages it actually tracks - the exact, unambiguous label for that
      // stage, not the generic many-to-one default map. A stage outside the
      // tracked set is invisible on purpose: skip it rather than push
      // something the reverse direction (the webhook) could never read back
      // correctly. A project that never opted in (`trackedStages` empty)
      // keeps the old one-way, best-effort default-map behaviour, resolved
      // by the worker itself - `statusName: null` here means "let the worker
      // fall back", not "nothing to sync".
      const statusName = trackedStages.length
        ? clickUpStatusForTrackedStage(update.clickUpStage, trackedStages)
        : null;
      if (trackedStages.length && statusName === null) continue;

      ids.push(
        await queueOutbox(tx, {
          projectId: update.projectId,
          provider: 'CLICKUP',
          kind: 'stage_sync',
          payload: {
            taskId: link.externalId,
            stage: update.clickUpStage,
            statusName,
            note: update.title,
          },
        }),
      );
    }
  }
  return ids;
}

export type ClickUpSyncOutcome =
  { applied: true; from: ProjectStage; to: ProjectStage } | { applied: false; reason: string };

/**
 * The reverse of `fanOut`'s ClickUp branch - a manual move on the linked
 * ClickUp task's list, delivered by `/api/webhooks/clickup`, applied back to
 * the project. Deliberately does **not** call `fanOut` for ClickUp: pushing
 * the same status straight back at the task that just reported it would be
 * a redundant round trip at best and a feedback loop at worst. Slack still
 * hears about it - a real stage change either way - just not ClickUp.
 *
 * Attributed to the project's own AHN project manager (the closest thing to
 * an accountable actor a webhook has) rather than left blank -
 * `StageEvent.changedById` is not nullable, and a real person's audit trail
 * for a monitored change beats inventing a system user for one caller. A
 * project with no PM assigned cannot be synced this way - reported back as
 * `applied: false`, never silently skipped.
 */
export async function applyClickUpStatusSync(input: {
  projectId: string;
  to: ProjectStage;
}): Promise<ClickUpSyncOutcome> {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      code: true,
      stage: true,
      ahnProjectManagerId: true,
      merchant: { select: { name: true } },
    },
  });
  if (!project) return { applied: false, reason: 'Project not found.' };
  if (project.stage === input.to) {
    return { applied: false, reason: `Already at ${STAGES[input.to].label}.` };
  }
  if (!project.ahnProjectManagerId) {
    return {
      applied: false,
      reason: 'No AHN project manager is assigned to this project to attribute the change to.',
    };
  }

  const check = checkTransition(project.stage, input.to);
  if (!check.allowed) {
    return { applied: false, reason: check.reason ?? 'That stage change is not allowed.' };
  }

  const from = project.stage;
  const reason = 'Synced automatically from a ClickUp status change.';

  await transaction(async (tx) => {
    await moveStage(tx, {
      projectId: input.projectId,
      to: input.to,
      changedById: project.ahnProjectManagerId!,
      reason: check.requiresReason ? reason : null,
    });

    await recordActivity(tx, {
      projectId: input.projectId,
      type: 'STAGE_CHANGED',
      actorId: null,
      summary: `Stage moved to ${STAGES[input.to].label} (synced from ClickUp).`,
      visibility: 'EVERYONE',
      payload: { from, to: input.to, source: 'clickup_webhook' },
    });

    await audit(tx, {
      principal: null,
      projectId: input.projectId,
      action: 'clickup.webhook.stage_sync',
      entityType: 'Project',
      entityId: input.projectId,
      before: { stage: from },
      after: { stage: input.to },
      reason,
    });

    await recomputeHealth(tx, input.projectId);

    await fanOut(tx, {
      projectId: input.projectId,
      projectCode: project.code,
      title: `${project.merchant.name} moved to ${STAGES[input.to].label}`,
      body: 'Synced from a ClickUp status change.',
      tone: 'info',
      fields: [{ label: 'From', value: STAGES[from].label }],
      // No `clickUpStage` here - this is the one call site that must never
      // push back to ClickUp; see the function doc above.
    });
  });

  revalidateProject(project.code);
  return { applied: true, from, to: input.to };
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
