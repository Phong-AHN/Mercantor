import { env } from '@relay/config';
import { clock, STAGES, type ProjectStage } from '@relay/core';
import { db } from '@relay/db';
import { clickUpStatusFor, integrations, type ProviderResult } from '@relay/integrations';
import { logger } from '@relay/observability';
import type { IntegrationJob } from '@relay/queue';

/**
 * Outbox delivery. The job names a row and carries nothing else, so a message
 * queued before an edit cannot deliver the stale copy, and a Redis outage means
 * the row is simply picked up by the two-minute retry sweep instead.
 */
const MAX_ATTEMPTS = 6;

export async function processIntegration(job: IntegrationJob): Promise<void> {
  const message = await db.outboxMessage.findUnique({
    where: { id: job.outboxId },
    select: {
      id: true,
      provider: true,
      kind: true,
      payload: true,
      status: true,
      attempts: true,
      project: { select: { id: true, code: true, merchant: { select: { name: true } } } },
    },
  });

  if (!message) {
    logger.warn({ outboxId: job.outboxId }, 'outbox row is gone; nothing to deliver');
    return;
  }
  if (message.status === 'DELIVERED' || message.status === 'SKIPPED') return;

  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const projectUrl = message.project
    ? `${env().APP_URL}/projects/${message.project.code}`
    : env().APP_URL;

  let result: ProviderResult<unknown>;
  try {
    result = await deliver(message.provider, message.kind, payload, {
      projectUrl,
      projectCode: message.project?.code ?? 'RELAY',
    });
  } catch (error) {
    result = {
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        userMessage: 'The integration threw an unexpected error.',
        retryable: true,
      },
    };
    logger.error({ err: error, outboxId: message.id }, 'integration delivery threw');
  }

  const attempts = message.attempts + 1;

  // Not a failure - "this person has no Slack account" for a personal DM,
  // say. Marked SKIPPED, never retried, and never counted against the
  // integration link's error state.
  if (result.skip) {
    await db.outboxMessage.update({
      where: { id: message.id },
      data: { status: 'SKIPPED', attempts, lastError: result.error?.userMessage ?? null },
    });
    return;
  }

  if (result.ok) {
    await db.outboxMessage.update({
      where: { id: message.id },
      data: {
        status: 'DELIVERED',
        attempts,
        deliveredAt: clock.now(),
        externalRef: result.externalRef ?? null,
        lastError: null,
      },
    });
    if (message.project) {
      await db.integrationLink.updateMany({
        where: { projectId: message.project.id, provider: message.provider },
        data: { lastSyncAt: clock.now(), lastError: null },
      });
    }
    return;
  }

  // A non-retryable failure is terminal: retrying a bad channel id or a revoked
  // token forever only hides the problem from the people who can fix it.
  const terminal = result.error?.retryable === false || attempts >= MAX_ATTEMPTS;

  await db.outboxMessage.update({
    where: { id: message.id },
    data: {
      status: terminal ? 'FAILED' : 'PENDING',
      attempts,
      lastError: result.error?.userMessage ?? 'Delivery failed.',
      availableAt: new Date(clock.now().getTime() + backoffMs(attempts)),
    },
  });

  if (message.project) {
    await db.integrationLink.updateMany({
      where: { projectId: message.project.id, provider: message.provider },
      data: { lastError: result.error?.userMessage ?? 'Delivery failed.' },
    });
  }

  if (!terminal) {
    // Throwing hands the retry back to BullMQ's backoff as well as the sweep.
    throw new Error(result.error?.userMessage ?? 'Delivery failed.');
  }
}

function backoffMs(attempts: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** (attempts - 1));
}

async function deliver(
  provider: 'SLACK' | 'CLICKUP' | 'EMAIL',
  kind: string,
  payload: Record<string, unknown>,
  context: { projectUrl: string; projectCode: string },
): Promise<ProviderResult<unknown>> {
  const registry = integrations();

  if (provider === 'SLACK') {
    if (kind === 'notification_dm') {
      const lookup = await registry.slack.findUserByEmail(String(payload.email ?? ''));
      if (!lookup.ok || !lookup.data) {
        return { ok: false, skip: true, error: lookup.error };
      }
      return registry.slack.postUpdate({
        destination: { channelId: lookup.data.slackUserId },
        title: String(payload.title ?? 'Notification'),
        body: payload.body ? String(payload.body) : undefined,
        tone: 'warning',
        projectUrl: context.projectUrl,
        projectCode: context.projectCode,
      });
    }
    return registry.slack.postUpdate({
      destination: { channelId: String(payload.channelId ?? '') },
      title: String(payload.title ?? 'Project update'),
      body: payload.body ? String(payload.body) : undefined,
      tone: (payload.tone as 'info' | 'success' | 'warning' | 'danger') ?? 'info',
      fields: (payload.fields as { label: string; value: string }[] | undefined) ?? [],
      projectUrl: context.projectUrl,
      projectCode: String(payload.projectCode ?? context.projectCode),
    });
  }

  if (provider === 'CLICKUP') {
    if (kind === 'stage_sync') {
      const stage = payload.stage as ProjectStage;
      return registry.clickup.updateStatus({
        taskId: String(payload.taskId ?? ''),
        stage,
        statusName: clickUpStatusFor(stage),
        note: payload.note
          ? `${String(payload.note)}\n\nPortal stage: ${STAGES[stage].label}\n${context.projectUrl}`
          : undefined,
      });
    }
    return registry.clickup.comment(
      String(payload.taskId ?? ''),
      `${String(payload.body ?? '')}\n\n${context.projectUrl}`,
    );
  }

  return registry.email.send({
    to: (payload.to as { name?: string; email: string }[] | undefined) ?? [],
    subject: String(payload.subject ?? 'Update from the migration portal'),
    text: String(payload.text ?? ''),
    html: String(payload.html ?? ''),
  });
}
