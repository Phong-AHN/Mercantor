'use server';

import { z } from 'zod';
import { ConflictError } from '@relay/core';
import { db, transaction } from '@relay/db';
import { integrations } from '@relay/integrations';
import { actionOk, defineAction } from '@/server/action';
import { audit, recordActivity } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';

/**
 * Accepts either a bare ClickUp task id or a full task URL - `app.clickup.com`
 * links look like `/t/<id>` or `/t/<team>/<id>` depending on where they were
 * copied from - so pasting either one works the same way `fetchMessage`
 * already accepts a raw Slack permalink.
 */
function parseClickUpTaskId(raw: string): string {
  const trimmed = raw.trim();
  const match = /\/t\/(?:[^/?#]+\/)?([a-z0-9_-]+)\/?(?:[?#].*)?$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/**
 * Links this project's record to an existing ClickUp task, verified live
 * before it is saved - the same shape as `recordSlackMessageAction` pulling
 * in a Slack permalink, and the reason `createClickUpTaskAction` (issues)
 * never had to ask "which list": once a project is linked, every subtask
 * reads the list from this task rather than needing its own setting.
 */
export const linkClickUpTaskAction = defineAction({
  name: 'integration.link_clickup',
  permission: 'project:update',
  input: z.object({
    code: z.string().min(1),
    task: z.string().trim().min(1, 'Paste a ClickUp task ID or link.'),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const taskId = parseClickUpTaskId(input.task);

    const result = await integrations().clickup.getTask(taskId);
    if (!result.ok || !result.data) {
      throw new ConflictError(result.error?.userMessage ?? 'That ClickUp task could not be found.');
    }
    const task = result.data;

    await transaction(async (tx) => {
      await tx.integrationLink.upsert({
        where: { projectId_provider: { projectId: project.id, provider: 'CLICKUP' } },
        create: {
          projectId: project.id,
          provider: 'CLICKUP',
          externalId: task.taskId,
          displayName: task.name ?? task.taskId,
          externalUrl: task.url,
        },
        update: {
          externalId: task.taskId,
          displayName: task.name ?? task.taskId,
          externalUrl: task.url,
          isActive: true,
          lastError: null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INTEGRATION_LINKED',
        actorId: ctx.principal.id,
        summary: `Connected to ClickUp task ${task.name ?? task.taskId}.`,
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'integration.link_clickup',
        entityType: 'IntegrationLink',
        entityId: project.id,
        after: { provider: 'CLICKUP', taskId: task.taskId },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, `Connected to ${task.name ?? task.taskId}.`);
  },
});

/**
 * Links this project to a Slack channel, chosen from the live
 * `conversations.list` result rather than typed in free-hand - a channel id
 * copied wrong would otherwise fail silently until the first `postUpdate`.
 * Re-validated against a fresh list server-side rather than trusting
 * whatever the client last rendered.
 */
export const linkSlackChannelAction = defineAction({
  name: 'integration.link_slack',
  permission: 'project:update',
  input: z.object({
    code: z.string().min(1),
    channelId: z.string().trim().min(1, 'Choose a channel.'),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const result = await integrations().slack.listChannels();
    if (!result.ok || !result.data) {
      throw new ConflictError(result.error?.userMessage ?? 'Slack channels could not be listed.');
    }
    const channel = result.data.find((candidate) => candidate.channelId === input.channelId);
    if (!channel) {
      throw new ConflictError('That channel is no longer available. Refresh and try again.');
    }
    const channelName = channel.channelName ?? channel.channelId;
    // No API returns a stable deep link to a channel by itself (only to a
    // message inside one) - `app_redirect` is Slack's own documented,
    // workspace-agnostic way to link to one from outside Slack.
    const externalUrl = `https://slack.com/app_redirect?channel=${channel.channelId}`;

    await transaction(async (tx) => {
      await tx.integrationLink.upsert({
        where: { projectId_provider: { projectId: project.id, provider: 'SLACK' } },
        create: {
          projectId: project.id,
          provider: 'SLACK',
          externalId: channel.channelId,
          displayName: channelName,
          externalUrl,
        },
        update: {
          externalId: channel.channelId,
          displayName: channelName,
          externalUrl,
          isActive: true,
          lastError: null,
        },
      });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INTEGRATION_LINKED',
        actorId: ctx.principal.id,
        summary: `Connected to Slack channel ${channelName}.`,
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'integration.link_slack',
        entityType: 'IntegrationLink',
        entityId: project.id,
        after: { provider: 'SLACK', channelId: channel.channelId },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(undefined, `Connected to ${channelName}.`);
  },
});

/**
 * Removes a project's link to Slack or ClickUp. Nothing downstream treats
 * "linked" as permanent - `createClickUpTaskAction` already refuses cleanly
 * when there is no link, and the worker's delivery processors skip a
 * provider with none - so this is a plain delete, not a soft-disable.
 */
export const unlinkIntegrationAction = defineAction({
  name: 'integration.unlink',
  permission: 'project:update',
  input: z.object({
    code: z.string().min(1),
    provider: z.enum(['SLACK', 'CLICKUP']),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);

    const link = await db.integrationLink.findUnique({
      where: { projectId_provider: { projectId: project.id, provider: input.provider } },
      select: { id: true, displayName: true, externalId: true },
    });
    if (!link) {
      throw new ConflictError('Nothing is connected yet.');
    }

    await transaction(async (tx) => {
      await tx.integrationLink.delete({ where: { id: link.id } });

      await recordActivity(tx, {
        projectId: project.id,
        type: 'INTEGRATION_UNLINKED',
        actorId: ctx.principal.id,
        summary: `Disconnected from ${input.provider === 'SLACK' ? 'Slack channel' : 'ClickUp task'} ${link.displayName ?? link.externalId}.`,
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'integration.unlink',
        entityType: 'IntegrationLink',
        entityId: project.id,
        before: { provider: input.provider, externalId: link.externalId },
        ip: ctx.ip,
      });
    });

    revalidateProject(input.code);
    return actionOk(
      undefined,
      `Disconnected from ${input.provider === 'SLACK' ? 'Slack' : 'ClickUp'}.`,
    );
  },
});
