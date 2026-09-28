'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clock,
  ConflictError,
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_STATUS_LABEL,
  FINDING_STATUSES,
  findingTransition,
  NotFoundError,
  PAGE_TYPES,
  ValidationError,
} from '@relay/core';
import { transaction, type DbTransaction } from '@relay/db';
import { can, isConfinedToOwnProjects } from '@relay/rbac';
import { classifyPageType, normaliseUrl } from '@relay/storefront';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';

function revalidateFindings(code: string): void {
  revalidateProject(code);
  revalidatePath('/findings');
  revalidatePath('/qa');
  revalidatePath('/portal/qa');
}

async function loadFinding(tx: DbTransaction, projectId: string, findingId: string) {
  const finding = await tx.finding.findFirst({
    where: { id: findingId, projectId },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      severity: true,
      assigneeId: true,
      clientVisibleAt: true,
      falsePositive: true,
    },
  });
  if (!finding) throw new NotFoundError('That finding is not on this project.');
  return finding;
}

export const createFindingAction = defineAction({
  name: 'finding.create',
  permission: 'finding:create',
  input: z.object({
    code: z.string().min(1),
    url: z.string().trim().min(1, 'Which page is it on?').max(500),
    pageType: z.enum(PAGE_TYPES).optional(),
    category: z.enum(FINDING_CATEGORIES),
    severity: z.enum(FINDING_SEVERITIES).default('MEDIUM'),
    title: z.string().trim().min(3, 'Describe the problem in a line.').max(300),
    evidenceText: z.string().trim().max(4000).optional(),
    suggestion: z.string().trim().max(2000).optional(),
    recommendation: z.string().trim().max(4000).optional(),
    assigneeId: z.string().uuid().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const url = normaliseUrl(input.url);
    if (!url) {
      throw new ValidationError('That is not a web address.', {
        url: ['Enter the full page address.'],
      });
    }

    const created = await transaction(async (tx) => {
      const page = await tx.storefrontPage.findUnique({
        where: { projectId_url: { projectId: project.id, url } },
        select: { id: true, pageType: true },
      });
      const count = await tx.finding.count({ where: { projectId: project.id } });
      const finding = await tx.finding.create({
        data: {
          projectId: project.id,
          reference: `FND-${count + 1}`,
          pageId: page?.id ?? null,
          url,
          pageType: input.pageType ?? page?.pageType ?? classifyPageType(url),
          category: input.category,
          severity: input.severity,
          source: 'MANUAL',
          detector: 'manual',
          title: input.title,
          evidenceText: input.evidenceText || null,
          suggestion: input.suggestion || null,
          recommendation: input.recommendation || null,
          // A person reported it, so it is reviewed by definition.
          status: 'REVIEWED',
          reviewedById: ctx.principal.id,
          reviewedAt: clock.now(),
          // Manual findings are never re-detected, so each is its own identity.
          fingerprint: `manual:${randomUUID()}`,
          assigneeId: input.assigneeId ?? null,
        },
        select: { id: true, reference: true },
      });

      await tx.findingEvent.create({
        data: {
          findingId: finding.id,
          actorId: ctx.principal.id,
          field: 'status',
          toValue: 'REVIEWED',
          note: 'Reported manually.',
        },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'finding.create',
        entityType: 'Finding',
        entityId: finding.id,
        after: { title: input.title, category: input.category, severity: input.severity },
        ip: ctx.ip,
      });

      if (input.assigneeId) {
        await notify(tx, {
          userIds: [input.assigneeId],
          projectId: project.id,
          type: 'ASSIGNED',
          title: `${finding.reference} on ${project.merchantName} is yours`,
          body: input.title,
          href: `/projects/${project.code}/qa/findings/${finding.reference}`,
          exceptUserId: ctx.principal.id,
        });
      }
      return finding;
    });

    revalidateFindings(input.code);
    return actionOk({ reference: created.reference }, `${created.reference} logged.`);
  },
});

/**
 * Status, severity and assignee. Every changed field writes a FindingEvent,
 * which is the finding's own history - who moved it, from what, to what,
 * and why.
 */
export const updateFindingAction = defineAction({
  name: 'finding.update',
  permission: 'finding:manage',
  input: z.object({
    code: z.string().min(1),
    findingId: z.string().uuid(),
    status: z.enum(FINDING_STATUSES).optional(),
    severity: z.enum(FINDING_SEVERITIES).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();

    const message = await transaction(async (tx) => {
      const finding = await loadFinding(tx, project.id, input.findingId);
      const events: Array<{ field: string; fromValue: string | null; toValue: string | null }> = [];
      const data: Parameters<DbTransaction['finding']['update']>[0]['data'] = {};

      if (input.status && input.status !== finding.status) {
        const move = findingTransition(finding.status, input.status, {
          note: input.note,
          reason: input.note,
        });
        if (!move.ok) throw new ValidationError(move.reason, { note: [move.reason] });
        data.status = input.status;
        if (input.status === 'REVIEWED') {
          data.reviewedById = ctx.principal.id;
          data.reviewedAt = now;
        }
        if (input.status === 'RESOLVED') {
          data.verifiedAt = now;
          data.verificationNote = input.note ?? null;
          data.verificationResult = 'PASSED';
        }
        if (input.status === 'READY_FOR_VERIFICATION') {
          data.verificationResult = null;
          data.verifiedAt = null;
        }
        if (input.status === 'NEW' || input.status === 'IN_PROGRESS') {
          // Reopening a dismissed finding also withdraws a false-positive mark.
          if (finding.falsePositive) data.falsePositive = false;
        }
        events.push({ field: 'status', fromValue: finding.status, toValue: input.status });
      }
      if (input.severity && input.severity !== finding.severity) {
        data.severity = input.severity;
        events.push({ field: 'severity', fromValue: finding.severity, toValue: input.severity });
      }
      if (input.assigneeId !== undefined && input.assigneeId !== finding.assigneeId) {
        data.assigneeId = input.assigneeId;
        events.push({ field: 'assignee', fromValue: finding.assigneeId, toValue: input.assigneeId });
      }
      if (events.length === 0) throw new ConflictError('Nothing changed.');

      await tx.finding.update({ where: { id: finding.id }, data });
      for (const event of events) {
        await tx.findingEvent.create({
          data: {
            findingId: finding.id,
            actorId: ctx.principal.id,
            ...event,
            note: event.field === 'status' ? (input.note ?? null) : null,
          },
        });
      }

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'finding.update',
        entityType: 'Finding',
        entityId: finding.id,
        before: { status: finding.status, severity: finding.severity, assigneeId: finding.assigneeId },
        after: { status: input.status, severity: input.severity, assigneeId: input.assigneeId },
        ip: ctx.ip,
      });

      if (input.assigneeId && input.assigneeId !== finding.assigneeId) {
        await notify(tx, {
          userIds: [input.assigneeId],
          projectId: project.id,
          type: 'ASSIGNED',
          title: `${finding.reference} on ${project.merchantName} is yours`,
          body: finding.title,
          href: `/projects/${project.code}/qa/findings/${finding.reference}`,
          exceptUserId: ctx.principal.id,
        });
      }

      return input.status && input.status !== finding.status
        ? `${finding.reference} moved to ${FINDING_STATUS_LABEL[input.status].label.toLowerCase()}.`
        : `${finding.reference} updated.`;
    });

    revalidateFindings(input.code);
    return actionOk(undefined, message);
  },
});

/**
 * A false positive is dismissed AND remembered: the next automated check
 * that produces the same fingerprint bumps the existing row instead of
 * opening a new one, so the reviewer never sees it again.
 */
export const markFalsePositiveAction = defineAction({
  name: 'finding.false_positive',
  permission: 'finding:manage',
  input: z.object({
    code: z.string().min(1),
    findingId: z.string().uuid(),
    reason: z.string().trim().min(3, 'Say why this is not a real problem.').max(1000),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const finding = await loadFinding(tx, project.id, input.findingId);
      if (finding.falsePositive) throw new ConflictError('Already marked as a false positive.');
      await tx.finding.update({
        where: { id: finding.id },
        data: {
          falsePositive: true,
          falsePositiveReason: input.reason,
          status: 'DISMISSED',
          clientVisibleAt: null,
        },
      });
      await tx.findingEvent.create({
        data: {
          findingId: finding.id,
          actorId: ctx.principal.id,
          field: 'falsePositive',
          fromValue: finding.status,
          toValue: 'DISMISSED',
          note: input.reason,
        },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'finding.false_positive',
        entityType: 'Finding',
        entityId: finding.id,
        after: { reason: input.reason },
        ip: ctx.ip,
      });
    });
    revalidateFindings(input.code);
    return actionOk(undefined, 'Marked as a false positive.');
  },
});

/** Nothing reaches the merchant until somebody with `finding:approve` shares it. */
export const setFindingVisibilityAction = defineAction({
  name: 'finding.visibility',
  permission: 'finding:approve',
  input: z.object({
    code: z.string().min(1),
    findingIds: z.array(z.string().uuid()).min(1).max(200),
    visible: z.boolean(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const count = await transaction(async (tx) => {
      const findings = await tx.finding.findMany({
        where: { id: { in: input.findingIds }, projectId: project.id },
        select: { id: true, falsePositive: true },
      });
      const eligible = findings.filter((finding) => !input.visible || !finding.falsePositive);
      if (eligible.length === 0) {
        throw new ConflictError('False positives cannot be shared with the client.');
      }
      await tx.finding.updateMany({
        where: { id: { in: eligible.map((finding) => finding.id) } },
        data: { clientVisibleAt: input.visible ? clock.now() : null },
      });
      await tx.findingEvent.createMany({
        data: eligible.map((finding) => ({
          findingId: finding.id,
          actorId: ctx.principal.id,
          field: 'clientVisible',
          toValue: input.visible ? 'shared' : 'hidden',
        })),
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'finding.visibility',
        entityType: 'Finding',
        after: { ids: eligible.map((finding) => finding.id), visible: input.visible },
        ip: ctx.ip,
      });
      return eligible.length;
    });
    revalidateFindings(input.code);
    return actionOk(
      undefined,
      input.visible
        ? `${count} finding${count === 1 ? '' : 's'} shared with the client.`
        : `${count} finding${count === 1 ? '' : 's'} hidden from the client.`,
    );
  },
});

/**
 * Comments on a finding. A merchant can only comment on findings shared with
 * them, and what they write is always visible to both sides. An agency user
 * chooses: a note on a shared finding defaults to client-visible, and can be
 * kept internal.
 */
export const commentOnFindingAction = defineAction({
  name: 'finding.comment',
  permission: ['finding:read', 'comment:create'],
  input: z.object({
    code: z.string().min(1),
    findingId: z.string().uuid(),
    body: z.string().trim().min(1, 'Write something first.').max(8000),
    clientVisible: z.boolean().default(true),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const merchant = isConfinedToOwnProjects(ctx.principal);

    await transaction(async (tx) => {
      const finding = await loadFinding(tx, project.id, input.findingId);
      if (merchant && !finding.clientVisibleAt) {
        throw new NotFoundError('That finding is not on this project.');
      }
      const clientVisible = merchant ? true : input.clientVisible && !!finding.clientVisibleAt;
      if (!merchant && !can(ctx.principal, 'finding:create') && !clientVisible) {
        throw new ConflictError('Internal notes need finding access.');
      }
      const comment = await tx.findingComment.create({
        data: {
          findingId: finding.id,
          authorId: ctx.principal.id,
          body: input.body,
          clientVisible,
        },
        select: { id: true },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'finding.comment',
        entityType: 'FindingComment',
        entityId: comment.id,
        after: { findingId: finding.id, clientVisible },
        ip: ctx.ip,
      });
      if (merchant) {
        const team = await tx.project.findUnique({
          where: { id: project.id },
          select: { ahnProjectManagerId: true, ahnDesignerId: true },
        });
        await notify(tx, {
          userIds: [finding.assigneeId, team?.ahnProjectManagerId, team?.ahnDesignerId].filter(
            (id): id is string => typeof id === 'string',
          ),
          projectId: project.id,
          type: 'MERCHANT_FEEDBACK',
          title: `${project.merchantName} commented on ${finding.reference}`,
          body: input.body.slice(0, 280),
          href: `/projects/${project.code}/qa/findings/${finding.reference}`,
          exceptUserId: ctx.principal.id,
        });
      }
    });

    revalidateFindings(input.code);
    return actionOk(undefined, 'Comment posted.');
  },
});
