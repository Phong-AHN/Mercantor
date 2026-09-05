'use server';

import { z } from 'zod';
import {
  checkTransition,
  IllegalTransitionError,
  PreconditionFailedError,
  PROJECT_STAGES,
  STAGES,
  TEAMS,
  ValidationError,
  type ProjectStage,
} from '@relay/core';
import { transaction } from '@relay/db';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  autoRequestApprovals,
  fanOut,
  moveStage,
  unmetHandoffRequirements,
  nudgeWorker,
  parseDate,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from './mutations';

/**
 * Stage advancement. The state machine in `@relay/core` decides what is legal;
 * this action adds the product rules that need database state - a reason for
 * going backwards, and the readiness checks before a launch.
 */
export const advanceStageAction = defineAction({
  name: 'project.advance_stage',
  permission: 'project:advance_stage',
  input: z.object({
    code: z.string().min(1),
    to: z.enum(PROJECT_STAGES),
    reason: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const check = checkTransition(project.stage, input.to);

    if (!check.allowed) {
      throw new IllegalTransitionError(check.reason ?? 'That stage change is not allowed.', {
        from: project.stage,
        to: input.to,
      });
    }
    if (check.requiresReason && !input.reason) {
      throw new ValidationError('Moving a project backwards needs a reason.', {
        reason: ['Say why the project is moving back, so the timeline explains itself.'],
      });
    }

    // Readiness gates. These are product rules, not machine transitions: the
    // machine says the move is shaped correctly, these say it is earned.
    if (input.to === 'READY_FOR_SHOPLINE_REVIEW') {
      const unmet = await unmetHandoffRequirements(project.id);
      if (unmet.length > 0) {
        throw new PreconditionFailedError(
          'This project is not ready for SHOPLINE review yet.',
          unmet,
        );
      }
    }

    const outboxIds = await transaction(async (tx) => {
      await moveStage(tx, {
        projectId: project.id,
        to: input.to,
        changedById: ctx.principal.id,
        reason: input.reason ?? null,
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'STAGE_CHANGED',
        actorId: ctx.principal.id,
        summary: `Stage moved to ${STAGES[input.to].label}.`,
        detail: input.reason ?? null,
        // Progress is the merchant's own news; the reason may not be, so a
        // backwards move records the detail for AHN and SHOPLINE only.
        visibility: input.reason ? 'AHN_SHOPLINE' : 'EVERYONE',
        payload: { from: project.stage, to: input.to },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'project.advance_stage',
        entityType: 'Project',
        entityId: project.id,
        before: { stage: project.stage },
        after: { stage: input.to },
        reason: input.reason ?? null,
        ip: ctx.ip,
      });

      await notifyStageChange(
        tx,
        project.id,
        project.code,
        project.merchantName,
        input.to,
        ctx.principal.id,
      );
      await recomputeHealth(tx, project.id);

      const stageOutboxIds = await fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `${project.merchantName} moved to ${STAGES[input.to].label}`,
        body: input.reason ?? STAGES[input.to].description,
        tone: input.to === 'ON_HOLD_BLOCKED' ? 'warning' : 'info',
        fields: [
          { label: 'From', value: STAGES[project.stage].label },
          { label: 'Waiting on', value: STAGES[input.to].ownerTeam },
        ],
        clickUpStage: input.to,
      });

      const approvalOutboxIds = await autoRequestApprovals(tx, {
        projectId: project.id,
        projectCode: project.code,
        merchantName: project.merchantName,
        stage: input.to,
      });

      return [...stageOutboxIds, ...approvalOutboxIds];
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, `Moved to ${STAGES[input.to].label}.`);
  },
});

async function notifyStageChange(
  tx: Parameters<typeof recordActivity>[0],
  projectId: string,
  code: string,
  merchantName: string,
  stage: ProjectStage,
  actorId: string,
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      ahnProjectManagerId: true,
      ahnDeveloperId: true,
      shoplineAmId: true,
      shoplineSeId: true,
    },
  });
  if (!project) return;

  const everyone = [
    project.ahnProjectManagerId,
    project.ahnDeveloperId,
    project.shoplineAmId,
    project.shoplineSeId,
  ].filter((id): id is string => id !== null);

  const shopline = [project.shoplineAmId, project.shoplineSeId].filter(
    (id): id is string => id !== null,
  );

  if (stage === 'READY_FOR_SHOPLINE_REVIEW') {
    await notify(tx, {
      userIds: shopline,
      projectId,
      type: 'SHOPLINE_READY',
      title: `${merchantName} is ready for SHOPLINE review`,
      body: 'AHN has submitted the handoff package.',
      href: `/projects/${code}/handoff`,
      exceptUserId: actorId,
    });
    return;
  }

  if (stage === 'MERCHANT_QA' || stage === 'MERCHANT_DESIGN_REVIEW') {
    await notify(tx, {
      userIds: everyone,
      projectId,
      type: 'MERCHANT_FEEDBACK',
      title: `${merchantName} is now with the merchant (${STAGES[stage].label})`,
      href: `/projects/${code}`,
      exceptUserId: actorId,
    });
    return;
  }

  await notify(tx, {
    userIds: everyone,
    projectId,
    type: 'PROJECT_INACTIVE',
    title: `${merchantName} moved to ${STAGES[stage].label}`,
    href: `/projects/${code}`,
    exceptUserId: actorId,
  });
}

/** The "who owns the next step" field, which the answer strip reads. */
export const setNextActionAction = defineAction({
  name: 'project.set_next_action',
  permission: 'project:update',
  input: z.object({
    code: z.string().min(1),
    nextAction: z.string().trim().min(1, 'Say what happens next.').max(500),
    ownerUserId: z.string().uuid().optional(),
    ownerTeam: z.enum(TEAMS),
    dueDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const dueDate = parseDate(input.dueDate, 'dueDate');

    await transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: {
          nextAction: input.nextAction,
          nextActionOwnerId: input.ownerUserId ?? null,
          nextActionOwnerTeam: input.ownerTeam,
          nextActionDueDate: dueDate,
        },
      });
      await recordActivity(tx, {
        projectId: project.id,
        type: 'PROJECT_UPDATED',
        actorId: ctx.principal.id,
        summary: 'Next step updated.',
        detail: input.nextAction,
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'project.set_next_action',
        entityType: 'Project',
        entityId: project.id,
        after: { nextAction: input.nextAction, ownerTeam: input.ownerTeam },
        ip: ctx.ip,
      });
      if (input.ownerUserId) {
        await notify(tx, {
          userIds: [input.ownerUserId],
          projectId: project.id,
          type: 'ASSIGNED',
          title: `You own the next step on ${project.merchantName}`,
          body: input.nextAction,
          href: `/projects/${project.code}`,
          exceptUserId: ctx.principal.id,
        });
      }
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Next step updated.');
  },
});

export const assignPeopleAction = defineAction({
  name: 'project.assign',
  permission: 'project:assign',
  input: z.object({
    code: z.string().min(1),
    ahnProjectManagerId: z.string().uuid().nullable().optional(),
    ahnDeveloperId: z.string().uuid().nullable().optional(),
    shoplineAmId: z.string().uuid().nullable().optional(),
    shoplineSeId: z.string().uuid().nullable().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    await transaction(async (tx) => {
      const before = await tx.project.findUniqueOrThrow({
        where: { id: project.id },
        select: {
          ahnProjectManagerId: true,
          ahnDeveloperId: true,
          shoplineAmId: true,
          shoplineSeId: true,
        },
      });

      await tx.project.update({
        where: { id: project.id },
        data: {
          ahnProjectManagerId: input.ahnProjectManagerId ?? null,
          ahnDeveloperId: input.ahnDeveloperId ?? null,
          shoplineAmId: input.shoplineAmId ?? null,
          shoplineSeId: input.shoplineSeId ?? null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ASSIGNMENT_CHANGED',
        actorId: ctx.principal.id,
        summary: 'Project assignments changed.',
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'project.assign',
        entityType: 'Project',
        entityId: project.id,
        before,
        after: {
          ahnProjectManagerId: input.ahnProjectManagerId ?? null,
          ahnDeveloperId: input.ahnDeveloperId ?? null,
          shoplineAmId: input.shoplineAmId ?? null,
          shoplineSeId: input.shoplineSeId ?? null,
        },
        ip: ctx.ip,
      });

      const added = [
        input.ahnProjectManagerId,
        input.ahnDeveloperId,
        input.shoplineAmId,
        input.shoplineSeId,
      ].filter(
        (id): id is string =>
          id != null &&
          ![
            before.ahnProjectManagerId,
            before.ahnDeveloperId,
            before.shoplineAmId,
            before.shoplineSeId,
          ].includes(id),
      );

      await notify(tx, {
        userIds: added,
        projectId: project.id,
        type: 'ASSIGNED',
        title: `You were assigned to ${project.merchantName}`,
        href: `/projects/${project.code}`,
        exceptUserId: ctx.principal.id,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Assignments updated.');
  },
});

export const updateProjectAction = defineAction({
  name: 'project.update',
  permission: 'project:update',
  input: z.object({
    code: z.string().min(1),
    targetLaunchDate: z.string().optional(),
    migrationType: z.enum(['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID']).optional(),
    scopeSummary: z.string().trim().max(2000).optional(),
    deploymentNotes: z.string().trim().max(4000).optional(),
    contractTotalMinor: z.coerce.number().int().min(0).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const targetLaunchDate = parseDate(input.targetLaunchDate, 'targetLaunchDate');

    await transaction(async (tx) => {
      const before = await tx.project.findUniqueOrThrow({
        where: { id: project.id },
        select: {
          targetLaunchDate: true,
          migrationType: true,
          scopeSummary: true,
          deploymentNotes: true,
          contractTotalMinor: true,
        },
      });

      await tx.project.update({
        where: { id: project.id },
        data: {
          targetLaunchDate: input.targetLaunchDate === undefined ? undefined : targetLaunchDate,
          migrationType: input.migrationType,
          scopeSummary: input.scopeSummary,
          deploymentNotes: input.deploymentNotes,
          contractTotalMinor: input.contractTotalMinor,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'PROJECT_UPDATED',
        actorId: ctx.principal.id,
        summary: 'Project details updated.',
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'project.update',
        entityType: 'Project',
        entityId: project.id,
        before,
        after: input,
        ip: ctx.ip,
      });
      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Project updated.');
  },
});
