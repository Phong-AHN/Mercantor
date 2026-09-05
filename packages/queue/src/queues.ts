import { z } from 'zod';

/**
 * Every queue declares a zod payload schema, and both sides parse it: a payload
 * that does not validate never reaches a processor, on either side of Redis.
 *
 * Three rules the payloads obey, carried over from the previous project:
 *   - no content: jobs name a row, they do not carry its body, so a job queued
 *     before an edit cannot deliver the stale copy
 *   - no credentials: tokens are resolved at delivery time, never queued
 *   - no trusted identity: `actorId` can only *remove* a recipient, never add
 */

export const QUEUE_NAMES = ['notifications', 'integrations', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const notificationJob = z.object({
  /** What happened. Recipients are resolved by the processor from live rows. */
  subject: z.object({
    kind: z.enum([
      'stage_changed',
      'blocker_opened',
      'blocker_resolved',
      'comment_posted',
      'issue_reported',
      'approval_requested',
      'approval_decided',
      'handoff_submitted',
      'handoff_decided',
      'introduction_sent',
      'invoice_overdue',
      'mention',
    ]),
    projectId: z.string().uuid(),
    entityId: z.string().uuid().optional(),
  }),
  /** Used only to stop telling someone about their own action. */
  actorId: z.string().uuid().nullable(),
  correlationId: z.string().optional(),
});
export type NotificationJob = z.infer<typeof notificationJob>;

export const integrationJob = z.object({
  /** Names an OutboxMessage row. What to deliver is read from the database. */
  outboxId: z.string().uuid(),
  correlationId: z.string().optional(),
});
export type IntegrationJob = z.infer<typeof integrationJob>;

export const maintenanceJob = z.object({
  task: z.enum([
    /** Recompute health and ageing for every open project. */
    'recompute-health',
    /** Raise the notifications the brief lists: inactivity, missing access... */
    'sla-sweep',
    /** Mark invoices overdue once their due date has passed. */
    'invoice-sweep',
    'purge-expired-sessions',
    /** Retry outbox rows whose delivery failed. */
    'retry-outbox',
  ]),
  correlationId: z.string().optional(),
});
export type MaintenanceJob = z.infer<typeof maintenanceJob>;

export const QUEUE_PAYLOAD: {
  notifications: typeof notificationJob;
  integrations: typeof integrationJob;
  maintenance: typeof maintenanceJob;
} = {
  notifications: notificationJob,
  integrations: integrationJob,
  maintenance: maintenanceJob,
};

export interface QueuePayloads {
  notifications: NotificationJob;
  integrations: IntegrationJob;
  maintenance: MaintenanceJob;
}

/** Repeatable schedules, declared once and installed by the worker at boot. */
export const MAINTENANCE_SCHEDULE: { task: MaintenanceJob['task']; pattern: string }[] = [
  { task: 'retry-outbox', pattern: '*/2 * * * *' },
  { task: 'recompute-health', pattern: '*/15 * * * *' },
  { task: 'invoice-sweep', pattern: '10 6 * * *' },
  { task: 'sla-sweep', pattern: '0 7 * * *' },
  { task: 'purge-expired-sessions', pattern: '30 3 * * *' },
];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
