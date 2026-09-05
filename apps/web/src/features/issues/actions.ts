'use server';

import { z } from 'zod';
import {
  clock,
  ConflictError,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUSES,
  TEAMS,
  ValidationError,
  type IssueSeverity,
} from '@relay/core';
import { db, transaction } from '@relay/db';
import { integrations } from '@relay/integrations';
import { actionOk, defineAction } from '@/server/action';
import { audit, notify, recordActivity } from '@/server/record';
import {
  fanOut,
  nudgeWorker,
  parseDate,
  recomputeHealth,
  resolveProject,
  revalidateProject,
} from '@/features/projects/mutations';

/** ClickUp priority: 1 urgent .. 4 low. */
const CLICKUP_PRIORITY: Record<IssueSeverity, 1 | 2 | 3 | 4> = {
  LAUNCH_BLOCKER: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

/**
 * Issues and escalations. A `LAUNCH_BLOCKER` is the one severity that changes
 * project health on its own, which is why it is a severity rather than a flag.
 */
export const createIssueAction = defineAction({
  name: 'issue.create',
  permission: 'issue:create',
  input: z.object({
    code: z.string().min(1),
    title: z.string().trim().min(3, 'Give the issue a title.').max(200),
    description: z.string().trim().min(3, 'Describe what is wrong.').max(8000),
    severity: z.enum(ISSUE_SEVERITIES).default('MEDIUM'),
    ownerTeam: z.enum(TEAMS).default('AHN'),
    ownerUserId: z.string().uuid().optional(),
    dueDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const dueDate = parseDate(input.dueDate, 'dueDate');

    const outboxIds = await transaction(async (tx) => {
      // Per-project reference, so people can say "ISS-4 on Sunrise".
      const count = await tx.issue.count({ where: { projectId: project.id } });
      const reference = `ISS-${count + 1}`;

      const issue = await tx.issue.create({
        data: {
          projectId: project.id,
          reference,
          title: input.title,
          description: input.description,
          severity: input.severity,
          ownerTeam: input.ownerTeam,
          ownerUserId: input.ownerUserId ?? null,
          reportedById: ctx.principal.id,
          reportedAt: clock.now(),
          dueDate,
        },
        select: { id: true, reference: true },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'ISSUE_REPORTED',
        actorId: ctx.principal.id,
        summary: `${issue.reference} reported: ${input.title}`,
        detail: input.description.slice(0, 280),
        visibility: 'AHN_SHOPLINE',
        payload: { issueId: issue.id, severity: input.severity },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'issue.create',
        entityType: 'Issue',
        entityId: issue.id,
        after: { title: input.title, severity: input.severity },
        ip: ctx.ip,
      });

      const watchers = await tx.project.findUnique({
        where: { id: project.id },
        select: {
          ahnProjectManagerId: true,
          ahnDeveloperId: true,
          shoplineAmId: true,
          shoplineSeId: true,
        },
      });

      await notify(tx, {
        userIds: [
          input.ownerUserId,
          watchers?.ahnProjectManagerId,
          ...(input.severity === 'LAUNCH_BLOCKER'
            ? [watchers?.shoplineAmId, watchers?.shoplineSeId, watchers?.ahnDeveloperId]
            : []),
        ].filter((id): id is string => typeof id === 'string'),
        projectId: project.id,
        type: input.severity === 'LAUNCH_BLOCKER' ? 'LAUNCH_BLOCKER' : 'TECHNICAL_ASSISTANCE',
        title: `${ISSUE_SEVERITY_LABEL[input.severity].label} issue on ${project.merchantName}`,
        body: input.title,
        href: `/projects/${project.code}/issues`,
        exceptUserId: ctx.principal.id,
      });

      await recomputeHealth(tx, project.id);

      if (input.severity === 'LAUNCH_BLOCKER' || input.severity === 'HIGH') {
        return fanOut(tx, {
          projectId: project.id,
          projectCode: project.code,
          title: `${issue.reference} - ${input.title}`,
          body: input.description.slice(0, 700),
          tone: input.severity === 'LAUNCH_BLOCKER' ? 'danger' : 'warning',
          fields: [
            { label: 'Severity', value: ISSUE_SEVERITY_LABEL[input.severity].label },
            { label: 'Owner', value: input.ownerTeam },
          ],
        });
      }
      return [];
    });

    await nudgeWorker(outboxIds);
    revalidateProject(input.code);
    return actionOk(undefined, 'Issue reported.');
  },
});

export const updateIssueAction = defineAction({
  name: 'issue.update',
  permission: 'issue:manage',
  input: z.object({
    code: z.string().min(1),
    issueId: z.string().uuid(),
    status: z.enum(ISSUE_STATUSES).optional(),
    severity: z.enum(ISSUE_SEVERITIES).optional(),
    ownerTeam: z.enum(TEAMS).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    resolution: z.string().trim().max(4000).optional(),
    dueDate: z.string().optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const now = clock.now();
    const closing = input.status === 'RESOLVED' || input.status === 'WONT_FIX';

    if (closing && !input.resolution) {
      throw new ValidationError('Closing an issue needs a resolution.', {
        resolution: ['Say how it was resolved, or why it will not be.'],
      });
    }

    await transaction(async (tx) => {
      const issue = await tx.issue.findFirst({
        where: { id: input.issueId, projectId: project.id },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          severity: true,
          resolvedAt: true,
        },
      });
      if (!issue) throw new ConflictError('That issue is not on this project.');

      await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: input.status,
          severity: input.severity,
          ownerTeam: input.ownerTeam,
          ownerUserId: input.ownerUserId,
          resolution: input.resolution,
          resolvedAt: closing ? (issue.resolvedAt ?? now) : input.status ? null : undefined,
          dueDate: input.dueDate === undefined ? undefined : parseDate(input.dueDate, 'dueDate'),
        },
      });

      if (closing) {
        await recordActivity(tx, {
          projectId: project.id,
          type: 'ISSUE_RESOLVED',
          actorId: ctx.principal.id,
          summary: `${issue.reference} closed: ${issue.title}`,
          detail: input.resolution ?? null,
          visibility: 'AHN_SHOPLINE',
          payload: { issueId: issue.id },
        });
      }

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'issue.update',
        entityType: 'Issue',
        entityId: issue.id,
        before: { status: issue.status, severity: issue.severity },
        after: { status: input.status, severity: input.severity },
        ip: ctx.ip,
      });

      await recomputeHealth(tx, project.id);
    });

    revalidateProject(input.code);
    return actionOk(undefined, closing ? 'Issue closed.' : 'Issue updated.');
  },
});

/**
 * Creates a real ClickUp task for one issue, as a subtask of the project's
 * already-linked task. That is what makes a separate "which list" setting
 * unnecessary: `getTask` on the linked task reveals the list it lives in,
 * and `parent` on the create call nests the new task under it, so the whole
 * chain works from the single link a project already has.
 *
 * A direct call, not the outbox: the point of clicking this button is to see
 * the result (or the reason it failed) immediately, the same reasoning
 * `recordSlackMessageAction` uses for pulling a message in from Slack.
 */
export const createClickUpTaskAction = defineAction({
  name: 'issue.create_clickup_task',
  permission: 'issue:manage',
  input: z.object({ code: z.string().min(1), issueId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const issue = await db.issue.findFirst({
      where: { id: input.issueId, projectId: project.id },
      select: {
        id: true,
        reference: true,
        title: true,
        description: true,
        severity: true,
        dueDate: true,
        clickUpTaskId: true,
      },
    });
    if (!issue) throw new ConflictError('That issue is not on this project.');
    if (issue.clickUpTaskId) {
      throw new ConflictError('This issue already has a ClickUp task.');
    }

    const link = await db.integrationLink.findFirst({
      where: { projectId: project.id, provider: 'CLICKUP', isActive: true },
      select: { externalId: true },
    });
    if (!link) {
      throw new ConflictError('This project has no ClickUp task linked yet.');
    }

    const registry = integrations();
    const parent = await registry.clickup.getTask(link.externalId);
    if (!parent.ok || !parent.data?.listId) {
      throw new ConflictError(
        parent.error?.userMessage ?? 'Could not find the ClickUp list for this project.',
      );
    }

    const created = await registry.clickup.createTask({
      listId: parent.data.listId,
      name: `${issue.reference}: ${issue.title}`,
      description: issue.description,
      priority: CLICKUP_PRIORITY[issue.severity],
      dueDate: issue.dueDate,
      tags: [ISSUE_SEVERITY_LABEL[issue.severity].label],
      parentTaskId: link.externalId,
    });
    if (!created.ok || !created.data) {
      throw new ConflictError(created.error?.userMessage ?? 'ClickUp did not create the task.');
    }

    await transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issue.id },
        data: { clickUpTaskId: created.data!.taskId, clickUpTaskUrl: created.data!.url },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'CLICKUP_SYNCED',
        actorId: ctx.principal.id,
        summary: `${issue.reference}: ClickUp task created`,
        visibility: 'AHN_SHOPLINE',
        payload: { issueId: issue.id, clickUpTaskId: created.data!.taskId },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'issue.create_clickup_task',
        entityType: 'Issue',
        entityId: issue.id,
        after: { clickUpTaskId: created.data!.taskId, clickUpTaskUrl: created.data!.url },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk({ url: created.data.url }, 'ClickUp task created.');
  },
});
