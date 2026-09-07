'use server';

import { z } from 'zod';
import {
  clock,
  COMMENT_CATEGORIES,
  COMMENT_STATUSES,
  COMMENT_VISIBILITIES,
  ConflictError,
  ForbiddenError,
  type CommentVisibility,
} from '@relay/core';
import { db, transaction } from '@relay/db';
import { writableVisibilities } from '@relay/rbac';
import { integrationsFor } from '@relay/integrations';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  fanOut,
  nudgeWorker,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/**
 * The activity feed. Visibility is the private-notes boundary: an AHN-internal
 * note is refused at write time for anyone who cannot hold that visibility, and
 * filtered out of the read query for anyone who cannot read it.
 */
export const postCommentAction = defineAction({
  name: 'comment.create',
  permission: 'comment:create',
  input: z.object({
    code: z.string().min(1),
    body: z.string().trim().min(1, 'Write something first.').max(8000),
    category: z.enum(COMMENT_CATEGORIES).default('GENERAL_UPDATE'),
    visibility: z.enum(COMMENT_VISIBILITIES).default('AHN_SHOPLINE'),
    status: z.enum(COMMENT_STATUSES).default('NONE'),
    parentId: z.string().uuid().optional(),
    assignedToId: z.string().uuid().optional(),
    mentions: z.array(z.string().uuid()).max(20).default([]),
    /** Post to the linked Slack channel as well. */
    alsoSlack: z.boolean().default(false),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const allowed = writableVisibilities(ctx.principal);
    if (!allowed.includes(input.visibility as CommentVisibility)) {
      throw new ForbiddenError('You cannot post a note at that visibility.', {
        visibility: input.visibility,
      });
    }

    const outboxIds = await transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.comment.findFirst({
          where: { id: input.parentId, projectId: project.id },
          select: { id: true },
        });
        if (!parent) throw new ConflictError('That thread is not on this project.');
      }

      const comment = await tx.comment.create({
        data: {
          projectId: project.id,
          authorId: ctx.principal.id,
          parentId: input.parentId ?? null,
          body: input.body,
          category: input.category,
          visibility: input.visibility,
          status: input.status,
          assignedToId: input.assignedToId ?? null,
          createdAt: clock.now(),
          mentions: {
            create: input.mentions.map((userId) => ({ userId })),
          },
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'COMMENT_POSTED',
        actorId: ctx.principal.id,
        summary: `${ctx.principal.name} posted an update.`,
        detail: input.body.slice(0, 280),
        visibility: input.visibility,
        payload: { commentId: comment.id, category: input.category },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'comment.create',
        entityType: 'Comment',
        entityId: comment.id,
        after: { category: input.category, visibility: input.visibility },
        ip: ctx.ip,
      });

      await notify(tx, {
        userIds: input.mentions,
        projectId: project.id,
        type: 'MENTIONED',
        title: `${ctx.principal.name} mentioned you on ${project.merchantName}`,
        body: input.body.slice(0, 200),
        href: `/projects/${project.code}/activity`,
        exceptUserId: ctx.principal.id,
      });

      if (input.assignedToId) {
        await notify(tx, {
          userIds: [input.assignedToId],
          projectId: project.id,
          type: 'ASSIGNED',
          title: `You were assigned an item on ${project.merchantName}`,
          body: input.body.slice(0, 200),
          href: `/projects/${project.code}/activity`,
          exceptUserId: ctx.principal.id,
        });
      }

      // An internal AHN note must never leave AHN, whatever the box says.
      if (input.alsoSlack && input.visibility !== 'INTERNAL_AHN') {
        return fanOut(tx, {
          projectId: project.id,
          projectCode: project.code,
          title: `${ctx.principal.name} on ${project.merchantName}`,
          body: input.body.slice(0, 900),
          tone: input.status === 'OPEN' ? 'warning' : 'info',
        });
      }
      return [];
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Update posted.');
  },
});

export const resolveCommentAction = defineAction({
  name: 'comment.resolve',
  permission: 'comment:manage',
  input: z.object({
    code: z.string().min(1),
    commentId: z.string().uuid(),
    status: z.enum(COMMENT_STATUSES),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    await transaction(async (tx) => {
      const comment = await tx.comment.findFirst({
        where: { id: input.commentId, projectId: project.id, deletedAt: null },
        select: { id: true, status: true, visibility: true },
      });
      if (!comment) throw new ConflictError('That item is not on this project.');
      if (!writableVisibilities(ctx.principal).includes(comment.visibility)) {
        throw new ForbiddenError('You cannot change that item.');
      }

      await tx.comment.update({
        where: { id: comment.id },
        data: {
          status: input.status,
          resolvedAt: input.status === 'RESOLVED' ? clock.now() : null,
        },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'comment.resolve',
        entityType: 'Comment',
        entityId: comment.id,
        before: { status: comment.status },
        after: { status: input.status },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Updated.');
  },
});

/**
 * Pulls a Slack message into the project history. The requirement is explicit
 * that important Slack messages should be recordable back into the record -
 * this is the one direction Slack is allowed to write.
 */
export const recordSlackMessageAction = defineAction({
  name: 'activity.record_slack',
  permission: 'comment:create',
  input: z.object({
    code: z.string().min(1),
    permalink: z.string().trim().url('Paste a Slack message link.'),
    visibility: z.enum(COMMENT_VISIBILITIES).default('AHN_SHOPLINE'),
    note: z.string().trim().max(500).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    if (!writableVisibilities(ctx.principal).includes(input.visibility)) {
      throw new ForbiddenError('You cannot record a message at that visibility.');
    }

    const registry = await integrationsFor(project.organizationId);
    const result = await registry.slack.fetchMessage(input.permalink);
    if (!result.ok || !result.data) {
      throw new ConflictError(result.error?.userMessage ?? 'That Slack message could not be read.');
    }
    const message = result.data;

    await transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          projectId: project.id,
          authorId: ctx.principal.id,
          body: input.note ? `${input.note}\n\n---\n${message.text}` : message.text,
          category: 'GENERAL_UPDATE',
          visibility: input.visibility,
          source: 'SLACK',
          sourceUrl: message.permalink,
          sourceRef: message.messageTs,
          createdAt: clock.now(),
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'SLACK_MESSAGE_RECORDED',
        actorId: ctx.principal.id,
        summary: `Slack message from ${message.authorName} recorded in the project history.`,
        detail: message.text.slice(0, 280),
        visibility: input.visibility,
        payload: { commentId: comment.id, permalink: message.permalink },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'activity.record_slack',
        entityType: 'Comment',
        entityId: comment.id,
        after: { permalink: message.permalink },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, 'Slack message recorded.');
  },
});

/** Mention autocomplete. Returns only people who can already see the project. */
export const searchMentionableUsersAction = defineAction({
  name: 'activity.search_users',
  permission: 'project:read',
  input: z.object({ code: z.string().min(1), q: z.string().trim().max(80).default('') }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const users = await db.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        name: input.q ? { contains: input.q, mode: 'insensitive' } : undefined,
        OR: [
          { role: { not: 'MERCHANT' } },
          { projectMemberships: { some: { projectId: project.id } } },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
      take: 8,
    });

    return actionOk(users);
  },
});
