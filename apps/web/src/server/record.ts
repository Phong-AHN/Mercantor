import {
  clock,
  renderNotificationEmail,
  type ActivityType,
  type CommentVisibility,
  type NotificationType,
} from '@relay/core';
import { env } from '@relay/config';
import type { DbTransaction, IntegrationProvider, Prisma } from '@relay/db';
import type { Principal } from '@relay/rbac';

/**
 * Three writes that must happen inside the same transaction as the change they
 * describe, so the log, the timeline and the outbox cannot drift from reality:
 *
 *   - `audit`     - who did what, for the compliance trail
 *   - `activity`  - the human-readable project history
 *   - `outbox`    - what to push to Slack or ClickUp afterwards
 *
 * A Slack outage therefore delays an update; it never loses one.
 */

export async function audit(
  tx: DbTransaction,
  input: {
    principal: Principal | null;
    projectId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
    reason?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.principal?.id ?? null,
      projectId: input.projectId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason ?? null,
      ip: input.ip ?? null,
      occurredAt: clock.now(),
    },
  });
}

export async function recordActivity(
  tx: DbTransaction,
  input: {
    projectId: string;
    type: ActivityType;
    actorId?: string | null;
    summary: string;
    detail?: string | null;
    visibility?: CommentVisibility;
    payload?: Prisma.InputJsonValue;
    /** Activity is what "last activity" means; pass false for system sweeps. */
    touchProject?: boolean;
  },
): Promise<void> {
  const now = clock.now();

  await tx.activityEvent.create({
    data: {
      projectId: input.projectId,
      type: input.type,
      actorId: input.actorId ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      visibility: input.visibility ?? 'AHN_SHOPLINE',
      payload: input.payload,
      occurredAt: now,
    },
  });

  if (input.touchProject !== false) {
    await tx.project.update({
      where: { id: input.projectId },
      data: { lastActivityAt: now },
    });
  }
}

export async function queueOutbox(
  tx: DbTransaction,
  input: {
    projectId: string | null;
    provider: IntegrationProvider;
    kind: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<string> {
  const row = await tx.outboxMessage.create({
    data: {
      projectId: input.projectId,
      provider: input.provider,
      kind: input.kind,
      payload: input.payload,
      availableAt: clock.now(),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * The in-app types urgent enough to also reach someone who is not looking at
 * the portal right now: a launch blocker, an approval only they can decide,
 * a project ready for SHOPLINE review, and a deployment decision (D-027).
 * Email and Slack DM both read this same set (D-039) - one urgency list,
 * not two that could quietly drift apart.
 */
const URGENT_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  'LAUNCH_BLOCKER',
  'APPROVAL_PENDING',
  'SHOPLINE_READY',
  'DEPLOYMENT_APPROVAL',
]);

export async function notify(
  tx: DbTransaction,
  input: {
    userIds: readonly string[];
    projectId?: string | null;
    type: Parameters<DbTransaction['notification']['create']>[0]['data']['type'];
    title: string;
    body?: string | null;
    href?: string | null;
    dedupeKey?: string | null;
    /** Never notify someone about their own action. */
    exceptUserId?: string | null;
  },
): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter((id) => id && id !== input.exceptUserId);
  if (recipients.length === 0) return;

  const now = clock.now();

  // A `dedupeKey` of `null` never collides in Postgres (NULL <> NULL), so a
  // one-off event without one always inserts - a plain `create` reproduces
  // that. Prisma's compound-unique `where` input does not accept `null` for
  // the nullable half of the pair, though, so a real dedupe key needs the
  // `upsert` branch instead; only there can the same key from a retried sweep
  // land on the same row rather than nagging a second time.
  const freshlyCreated: string[] = [];
  for (const userId of recipients) {
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${userId}` : null;
    const data = {
      userId,
      projectId: input.projectId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      dedupeKey,
      createdAt: now,
    };

    if (dedupeKey === null) {
      await tx.notification.create({ data });
      freshlyCreated.push(userId);
      continue;
    }

    const row = await tx.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      create: data,
      // A repeat of the same key is a no-op, not a second nag - the title is
      // re-written with itself so the branch is never a truly empty update.
      update: { title: input.title },
      select: { userId: true, createdAt: true },
    });
    if (row.createdAt.getTime() === now.getTime()) freshlyCreated.push(row.userId);
  }

  if (freshlyCreated.length > 0 && URGENT_NOTIFICATION_TYPES.has(input.type)) {
    await queueUrgentNotificationDeliveries(tx, {
      recipientIds: freshlyCreated,
      projectId: input.projectId ?? null,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    });
  }
}

/**
 * Delivery reuses the same outbox the project-update Slack/ClickUp posts go
 * through - one `OutboxMessage` row per recipient per channel, committed in
 * this same transaction. A failure is an outage, not a lost notification:
 * the row still exists and the two-minute sweep retries it.
 *
 * The Slack row carries the recipient's email, never a Slack id - the id is
 * resolved fresh at delivery time (`findUserByEmail`), not looked up here
 * and passed through the queue. Someone with no Slack account is a normal,
 * expected outcome, not a failure: `apps/worker` marks that row `SKIPPED`.
 */
async function queueUrgentNotificationDeliveries(
  tx: DbTransaction,
  input: {
    recipientIds: readonly string[];
    projectId: string | null;
    title: string;
    body: string | null;
    href: string | null;
  },
): Promise<void> {
  const recipients = await tx.user.findMany({
    where: { id: { in: [...input.recipientIds] }, isActive: true },
    select: { id: true, email: true, name: true },
  });
  if (recipients.length === 0) return;

  const projectUrl = input.href ? `${env().APP_URL}${input.href}` : env().APP_URL;

  for (const recipient of recipients) {
    const rendered = renderNotificationEmail({
      recipientName: recipient.name,
      title: input.title,
      body: input.body,
      projectUrl,
    });

    await queueOutbox(tx, {
      projectId: input.projectId,
      provider: 'EMAIL',
      kind: 'notification',
      payload: {
        to: [{ name: recipient.name, email: recipient.email }],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      },
    });

    await queueOutbox(tx, {
      projectId: input.projectId,
      provider: 'SLACK',
      kind: 'notification_dm',
      payload: {
        email: recipient.email,
        title: input.title,
        body: input.body,
      },
    });
  }
}
