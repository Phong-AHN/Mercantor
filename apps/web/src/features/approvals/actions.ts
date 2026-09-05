'use server';

import { z } from 'zod';
import {
  APPROVAL_TYPE_LABEL,
  APPROVAL_TYPES,
  clock,
  ConflictError,
  ForbiddenError,
  HANDOFF_DECISIONS,
  PreconditionFailedError,
  ValidationError,
} from '@relay/core';
import { transaction } from '@relay/db';
import { canDecideApproval } from '@relay/rbac';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  fanOut,
  moveStage,
  nudgeWorker,
  recomputeHealth,
  resolveProject,
  revalidateProject,
  unmetHandoffRequirements,
} from '@/features/projects/mutations';

/**
 * Formal checkpoints. The point of recording them here rather than leaving them
 * in email is that each one carries who decided it and when, and nobody can
 * decide a checkpoint that belongs to the other side of the table.
 */
export const requestApprovalAction = defineAction({
  name: 'approval.request',
  permission: 'approval:request',
  input: z.object({
    code: z.string().min(1),
    type: z.enum(APPROVAL_TYPES),
    notes: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    const outboxIds = await transaction(async (tx) => {
      await tx.approval.upsert({
        where: { projectId_type: { projectId: project.id, type: input.type } },
        create: {
          projectId: project.id,
          type: input.type,
          status: 'PENDING',
          requestedById: ctx.principal.id,
          requestedAt: now,
          notes: input.notes ?? null,
        },
        update: {
          status: 'PENDING',
          requestedById: ctx.principal.id,
          requestedAt: now,
          decidedById: null,
          decidedAt: null,
          notes: input.notes ?? null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'APPROVAL_REQUESTED',
        actorId: ctx.principal.id,
        summary: `${APPROVAL_TYPE_LABEL[input.type].label} requested.`,
        detail: input.notes ?? null,
        visibility: input.type === 'MERCHANT_FINAL' ? 'EVERYONE' : 'AHN_SHOPLINE',
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'approval.request',
        entityType: 'Approval',
        entityId: `${project.id}:${input.type}`,
        after: { type: input.type, status: 'PENDING' },
        ip: ctx.ip,
      });

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: {
          ahnProjectManagerId: true,
          shoplineAmId: true,
          shoplineSeId: true,
          members: { select: { userId: true } },
        },
      });

      const audience =
        input.type === 'SHOPLINE_DEPLOYMENT'
          ? [watchers?.shoplineAmId, watchers?.shoplineSeId]
          : input.type === 'MERCHANT_FINAL'
            ? (watchers?.members.map((member) => member.userId) ?? [])
            : [watchers?.ahnProjectManagerId];

      await notify(tx, {
        userIds: audience.filter((id): id is string => typeof id === 'string'),
        projectId: project.id,
        type: 'APPROVAL_PENDING',
        title: `${APPROVAL_TYPE_LABEL[input.type].label} needed on ${project.merchantName}`,
        body: input.notes ?? null,
        href: `/projects/${project.code}/approvals`,
        exceptUserId: ctx.principal.id,
      });

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `${APPROVAL_TYPE_LABEL[input.type].label} requested on ${project.merchantName}`,
        body: input.notes ?? undefined,
        tone: 'warning',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Approval requested.');
  },
});

export const decideApprovalAction = defineAction({
  name: 'approval.decide',
  permission: 'approval:read',
  input: z.object({
    code: z.string().min(1),
    type: z.enum(APPROVAL_TYPES),
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']),
    notes: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    if (!canDecideApproval(ctx.principal, input.type)) {
      throw new ForbiddenError('That checkpoint is not yours to decide.', { type: input.type });
    }
    if (input.decision !== 'APPROVED' && !input.notes) {
      throw new ValidationError('Say what needs to change.', {
        notes: ['A rejection without a reason is not actionable.'],
      });
    }

    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    const outboxIds = await transaction(async (tx) => {
      await tx.approval.upsert({
        where: { projectId_type: { projectId: project.id, type: input.type } },
        create: {
          projectId: project.id,
          type: input.type,
          status: input.decision,
          requestedById: ctx.principal.id,
          requestedAt: now,
          decidedById: ctx.principal.id,
          decidedAt: now,
          notes: input.notes ?? null,
        },
        update: {
          status: input.decision,
          decidedById: ctx.principal.id,
          decidedAt: now,
          notes: input.notes ?? null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'APPROVAL_DECIDED',
        actorId: ctx.principal.id,
        summary: `${APPROVAL_TYPE_LABEL[input.type].label}: ${input.decision.toLowerCase().replace(/_/g, ' ')}.`,
        detail: input.notes ?? null,
        visibility: 'EVERYONE',
        payload: { type: input.type, decision: input.decision },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'approval.decide',
        entityType: 'Approval',
        entityId: `${project.id}:${input.type}`,
        after: { type: input.type, status: input.decision },
        reason: input.notes ?? null,
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `${APPROVAL_TYPE_LABEL[input.type].label} - ${input.decision.toLowerCase().replace(/_/g, ' ')}`,
        body: input.notes ?? undefined,
        tone: input.decision === 'APPROVED' ? 'success' : 'warning',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Decision recorded.');
  },
});

/**
 * SUBMIT TO SHOPLINE. Everything the brief asks to be verified before
 * submission is checked here, server side, and a snapshot of the checklist is
 * stored so a later argument about what was true at submission has an answer.
 */
export const submitHandoffAction = defineAction({
  name: 'handoff.submit',
  permission: 'handoff:submit',
  input: z.object({
    code: z.string().min(1),
    deploymentNotes: z.string().trim().min(10, 'Describe the deployment plan.').max(4000),
    /** Acknowledges an override; only allowed when nothing is unmet. */
    confirm: z.boolean().default(false),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const unmet = await unmetHandoffRequirements(project.id);

    if (unmet.length > 0) {
      throw new PreconditionFailedError('This project is not ready to hand over yet.', unmet);
    }
    if (!input.confirm) {
      throw new ValidationError('Confirm the submission.', {
        confirm: ['Tick the box to confirm the package is ready for SHOPLINE.'],
      });
    }

    const outboxIds = await transaction(async (tx) => {
      const handoff = await tx.handoffSubmission.create({
        data: {
          projectId: project.id,
          submittedById: ctx.principal.id,
          submittedAt: clock.now(),
          checklist: {
            migrationComplete: true,
            designApproved: true,
            developmentComplete: true,
            qaPassed: true,
            merchantApproved: true,
            noOpenBlockers: true,
            accessVerified: true,
            verifiedAt: clock.now().toISOString(),
          },
          deploymentNotes: input.deploymentNotes,
          decision: 'PENDING',
        },
        select: { id: true },
      });

      await tx.project.update({
        where: { id: project.id },
        data: { deploymentNotes: input.deploymentNotes },
      });

      if (project.stage !== 'READY_FOR_SHOPLINE_REVIEW') {
        await moveStage(tx, {
          projectId: project.id,
          to: 'READY_FOR_SHOPLINE_REVIEW',
          changedById: ctx.principal.id,
          reason: 'Handoff package submitted to SHOPLINE.',
        });
      }

      await tx.approval.upsert({
        where: { projectId_type: { projectId: project.id, type: 'SHOPLINE_DEPLOYMENT' } },
        create: {
          projectId: project.id,
          type: 'SHOPLINE_DEPLOYMENT',
          status: 'PENDING',
          requestedById: ctx.principal.id,
          requestedAt: clock.now(),
        },
        update: { status: 'PENDING', requestedById: ctx.principal.id, requestedAt: clock.now() },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'HANDOFF_SUBMITTED',
        actorId: ctx.principal.id,
        summary: 'Submitted to SHOPLINE for deployment review.',
        detail: input.deploymentNotes,
        visibility: 'AHN_SHOPLINE',
        payload: { handoffId: handoff.id },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'handoff.submit',
        entityType: 'HandoffSubmission',
        entityId: handoff.id,
        after: { deploymentNotes: input.deploymentNotes },
        ip: ctx.ip,
      });

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: { shoplineAmId: true, shoplineSeId: true },
      });

      await notify(tx, {
        userIds: [watchers?.shoplineAmId, watchers?.shoplineSeId].filter(
          (id): id is string => typeof id === 'string',
        ),
        projectId: project.id,
        type: 'SHOPLINE_READY',
        title: `${project.merchantName} is ready for SHOPLINE review`,
        body: input.deploymentNotes.slice(0, 200),
        href: `/projects/${project.code}/handoff`,
        exceptUserId: ctx.principal.id,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title: `${project.merchantName} submitted for SHOPLINE review`,
        body: input.deploymentNotes.slice(0, 700),
        tone: 'success',
        clickUpStage: 'READY_FOR_SHOPLINE_REVIEW',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Submitted to SHOPLINE.');
  },
});

/** SHOPLINE's answer: approve deployment, request changes, or report an issue. */
export const decideHandoffAction = defineAction({
  name: 'handoff.decide',
  permission: 'handoff:decide',
  input: z.object({
    code: z.string().min(1),
    handoffId: z.string().uuid(),
    decision: z.enum(HANDOFF_DECISIONS).exclude(['PENDING']),
    notes: z.string().trim().max(4000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    if (input.decision !== 'APPROVED' && !input.notes) {
      throw new ValidationError('Say what is wrong.', {
        notes: ['AHN needs to know what to change before they can act.'],
      });
    }

    const outboxIds = await transaction(async (tx) => {
      const handoff = await tx.handoffSubmission.findFirst({
        where: { id: input.handoffId, projectId: project.id },
        select: { id: true, decision: true },
      });
      if (!handoff) throw new ConflictError('That submission is not on this project.');
      if (handoff.decision !== 'PENDING') {
        throw new ConflictError('That submission has already been decided.');
      }

      await tx.handoffSubmission.update({
        where: { id: handoff.id },
        data: {
          decision: input.decision,
          decidedById: ctx.principal.id,
          decidedAt: now,
          decisionNotes: input.notes ?? null,
        },
      });

      if (input.decision === 'APPROVED') {
        await tx.approval.update({
          where: { projectId_type: { projectId: project.id, type: 'SHOPLINE_DEPLOYMENT' } },
          data: { status: 'APPROVED', decidedById: ctx.principal.id, decidedAt: now },
        });
        await moveStage(tx, {
          projectId: project.id,
          to: 'READY_FOR_DEPLOYMENT',
          changedById: ctx.principal.id,
          reason: 'SHOPLINE approved deployment.',
        });
      } else {
        await tx.approval.update({
          where: { projectId_type: { projectId: project.id, type: 'SHOPLINE_DEPLOYMENT' } },
          data: {
            status: 'CHANGES_REQUESTED',
            decidedById: ctx.principal.id,
            decidedAt: now,
            notes: input.notes ?? null,
          },
        });
        await moveStage(tx, {
          projectId: project.id,
          to: 'DEVELOPMENT',
          changedById: ctx.principal.id,
          reason: input.notes ?? 'SHOPLINE requested changes.',
        });
      }

      await recordActivity(tx, {
        projectId: project.id,
        type: 'HANDOFF_DECIDED',
        actorId: ctx.principal.id,
        summary: `SHOPLINE: ${input.decision.toLowerCase().replace(/_/g, ' ')}.`,
        detail: input.notes ?? null,
        visibility: 'AHN_SHOPLINE',
        payload: { handoffId: handoff.id, decision: input.decision },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'handoff.decide',
        entityType: 'HandoffSubmission',
        entityId: handoff.id,
        after: { decision: input.decision },
        reason: input.notes ?? null,
        ip: ctx.ip,
      });

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: { ahnProjectManagerId: true, ahnDeveloperId: true },
      });

      await notify(tx, {
        userIds: [watchers?.ahnProjectManagerId, watchers?.ahnDeveloperId].filter(
          (id): id is string => typeof id === 'string',
        ),
        projectId: project.id,
        type: 'DEPLOYMENT_APPROVAL',
        title: `SHOPLINE ${input.decision === 'APPROVED' ? 'approved deployment' : 'requested changes'} on ${project.merchantName}`,
        body: input.notes ?? null,
        href: `/projects/${project.code}/handoff`,
        exceptUserId: ctx.principal.id,
      });

      await recomputeHealth(tx, project.id);

      return fanOut(tx, {
        projectId: project.id,
        projectCode: project.code,
        title:
          input.decision === 'APPROVED'
            ? `SHOPLINE approved deployment for ${project.merchantName}`
            : `SHOPLINE requested changes on ${project.merchantName}`,
        body: input.notes ?? undefined,
        tone: input.decision === 'APPROVED' ? 'success' : 'warning',
      });
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Decision recorded.');
  },
});
