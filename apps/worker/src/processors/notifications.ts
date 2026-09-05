import { clock, type NotificationType } from '@relay/core';
import { db } from '@relay/db';
import { logger } from '@relay/observability';
import type { NotificationJob } from '@relay/queue';

/**
 * Recipients are resolved here, from live rows, rather than being carried in
 * the payload. The payload names a subject and one identity - `actorId` - which
 * can only *remove* a recipient, never add one. That is what makes it safe to
 * trust: it cannot widen an audience.
 */
const TYPE_FOR_SUBJECT: Record<NotificationJob['subject']['kind'], NotificationType> = {
  stage_changed: 'PROJECT_INACTIVE',
  blocker_opened: 'LAUNCH_BLOCKER',
  blocker_resolved: 'LAUNCH_BLOCKER',
  comment_posted: 'MERCHANT_FEEDBACK',
  issue_reported: 'TECHNICAL_ASSISTANCE',
  approval_requested: 'APPROVAL_PENDING',
  approval_decided: 'APPROVAL_PENDING',
  handoff_submitted: 'SHOPLINE_READY',
  handoff_decided: 'DEPLOYMENT_APPROVAL',
  introduction_sent: 'INTRODUCTION_UNANSWERED',
  invoice_overdue: 'INVOICE_OVERDUE',
  mention: 'MENTIONED',
};

export async function processNotification(job: NotificationJob): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: job.subject.projectId },
    select: {
      id: true,
      code: true,
      merchant: { select: { name: true } },
      ahnProjectManagerId: true,
      ahnDeveloperId: true,
      shoplineAmId: true,
      shoplineSeId: true,
      members: { select: { userId: true } },
    },
  });

  if (!project) {
    logger.warn({ projectId: job.subject.projectId }, 'notification subject no longer exists');
    return;
  }

  const internal = [
    project.ahnProjectManagerId,
    project.ahnDeveloperId,
    project.shoplineAmId,
    project.shoplineSeId,
  ].filter((id): id is string => id !== null);

  const merchant = project.members.map((member) => member.userId);

  const audience =
    job.subject.kind === 'comment_posted' || job.subject.kind === 'introduction_sent'
      ? [...internal, ...merchant]
      : internal;

  const recipients = [...new Set(audience)].filter((id) => id !== job.actorId);
  if (recipients.length === 0) return;

  const type = TYPE_FOR_SUBJECT[job.subject.kind];

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      projectId: project.id,
      type,
      title: `${project.merchant.name}: ${job.subject.kind.replace(/_/g, ' ')}`,
      href: `/projects/${project.code}`,
      createdAt: clock.now(),
      dedupeKey: job.subject.entityId
        ? `${job.subject.kind}:${job.subject.entityId}:${userId}`
        : null,
    })),
    skipDuplicates: true,
  });
}
