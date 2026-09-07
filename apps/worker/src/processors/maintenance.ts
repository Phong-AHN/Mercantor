import { env } from '@relay/config';
import {
  assessHealth,
  clock,
  computeProjectTime,
  DAY_MS,
  DEFAULT_AGING_THRESHOLDS,
  DEFAULT_INACTIVITY_DAYS,
  detectOpenBreaches,
  formatMoney,
  renderNotificationEmail,
  STAGES,
  type AgingThresholds,
  type Team,
} from '@relay/core';
import { db, type Prisma } from '@relay/db';
import { logger } from '@relay/observability';
import { enqueue, type MaintenanceJob } from '@relay/queue';

/**
 * The scheduled work. Everything here is idempotent: it can run twice in the
 * same minute without producing a second nag or a second delivery.
 */
export async function processMaintenance(job: MaintenanceJob): Promise<void> {
  switch (job.task) {
    case 'retry-outbox':
      return retryOutbox();
    case 'recompute-health':
      return recomputeHealth();
    case 'invoice-sweep':
      return invoiceSweep();
    case 'sla-sweep':
      return slaSweep();
    case 'purge-expired-sessions':
      return purgeSessions();
  }
}

/** Anything still pending and due gets nudged back onto the queue. */
async function retryOutbox(): Promise<void> {
  const due = await db.outboxMessage.findMany({
    where: { status: 'PENDING', availableAt: { lte: clock.now() } },
    select: { id: true },
    take: 100,
  });

  for (const message of due) {
    // A custom jobId cannot contain `:` - BullMQ reserves it as the separator
    // in its own Redis keys (`bull:<queue>:<jobId>`) and `Job.validateOptions`
    // rejects one that has it, synchronously, before anything is written. A
    // hyphen keeps this idempotent (the same outbox row never queues twice)
    // without hitting that rejection.
    await enqueue('integrations', { outboxId: message.id }, { jobId: `outbox-${message.id}` });
  }
  if (due.length > 0) logger.info({ count: due.length }, 'outbox retried');
}

async function loadThresholds(): Promise<{ aging: AgingThresholds; inactivityDays: number }> {
  const rows = await db.portalSetting.findMany({
    where: { key: { in: ['aging-thresholds', 'inactivity-days'] } },
  });
  const aging = rows.find((row) => row.key === 'aging-thresholds')?.value as
    Partial<AgingThresholds> | undefined;
  const inactivity = rows.find((row) => row.key === 'inactivity-days')?.value as
    { days?: number } | undefined;

  return {
    aging: { ...DEFAULT_AGING_THRESHOLDS, ...aging },
    inactivityDays: inactivity?.days ?? DEFAULT_INACTIVITY_DAYS,
  };
}

const HEALTH_SELECT = {
  id: true,
  code: true,
  stage: true,
  health: true,
  startDate: true,
  targetLaunchDate: true,
  completedAt: true,
  lastActivityAt: true,
  merchant: { select: { name: true } },
  stageEvents: { select: { stage: true, enteredAt: true, exitedAt: true, ownerTeam: true } },
  blockers: {
    select: {
      id: true,
      startedAt: true,
      resolvedAt: true,
      ownerships: { select: { blockerId: true, ownerTeam: true, startedAt: true, endedAt: true } },
    },
  },
  issues: { select: { severity: true, status: true } },
  invoices: { select: { status: true, amountMinor: true, paidMinor: true, dueDate: true } },
} satisfies Prisma.ProjectSelect;

/**
 * Health is derived on every read, but the column is what the portfolio list
 * sorts and filters on. This keeps the column honest between mutations - a
 * project that quietly aged past its target overnight goes amber on its own.
 *
 * The same pass also opens formal `SlaBreach` rows: a project going over
 * target is exactly the kind of fact that becomes true purely because time
 * passed, with nobody having done anything, which is what this sweep already
 * exists to notice for health. Closing a stage breach is not this sweep's
 * job, though - `moveStage` closes one the instant the stage it belongs to is
 * exited, which is the exact moment and needs no guessing. This sweep only
 * closes a launch breach whose target date was pushed back, since editing
 * that date happens outside `moveStage` entirely.
 */
async function recomputeHealth(): Promise<void> {
  const { aging } = await loadThresholds();
  const now = clock.now();

  const projects = await db.project.findMany({
    where: { deletedAt: null, stage: { not: 'COMPLETED' } },
    select: HEALTH_SELECT,
  });

  const openBreaches = await db.slaBreach.findMany({
    where: { projectId: { in: projects.map((project) => project.id) }, resolvedAt: null },
    select: { id: true, projectId: true, kind: true, stage: true, startedAt: true },
  });
  const openByProject = new Map<string, typeof openBreaches>();
  for (const breach of openBreaches) {
    openByProject.set(breach.projectId, [...(openByProject.get(breach.projectId) ?? []), breach]);
  }

  let changed = 0;
  let breachesOpened = 0;
  let breachesResolved = 0;
  for (const project of projects) {
    const openBlockers = project.blockers.filter((blocker) => blocker.resolvedAt === null);

    const time = computeProjectTime({
      startedAt: project.startDate,
      targetLaunchDate: project.targetLaunchDate,
      completedAt: project.completedAt,
      stageSegments: project.stageEvents.map((event) => ({
        stage: event.stage,
        enteredAt: event.enteredAt,
        exitedAt: event.exitedAt,
        ownerTeam: event.ownerTeam as Team | null,
      })),
      blockerSegments: project.blockers.flatMap((blocker) =>
        blocker.ownerships.map((ownership) => ({
          blockerId: ownership.blockerId,
          ownerTeam: ownership.ownerTeam as Team,
          startedAt: ownership.startedAt,
          endedAt: ownership.endedAt,
        })),
      ),
      lastActivityAt: project.lastActivityAt,
      thresholds: aging,
      now,
    });

    const overdueInvoice = project.invoices.some(
      (invoice) =>
        invoice.status !== 'NOT_INVOICED' &&
        invoice.paidMinor < invoice.amountMinor &&
        invoice.dueDate !== null &&
        invoice.dueDate.getTime() < now.getTime(),
    );

    const verdict = assessHealth({
      stage: project.stage,
      time,
      openBlockerCount: openBlockers.length,
      openIssues: project.issues,
      overdueInvoice,
    });

    const current =
      [...openBlockers].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0] ?? null;

    if (verdict.health !== project.health) changed += 1;

    await db.project.update({
      where: { id: project.id },
      data: { health: verdict.health, currentBlockerId: current?.id ?? null },
    });

    const detected = detectOpenBreaches(time);
    const existing = openByProject.get(project.id) ?? [];

    for (const breach of detected) {
      const alreadyOpen = existing.some(
        (row) => row.kind === breach.kind && row.stage === breach.stage,
      );
      if (alreadyOpen) continue;
      await db.slaBreach.create({
        data: {
          projectId: project.id,
          kind: breach.kind,
          stage: breach.stage,
          targetDays: breach.targetDays,
          startedAt: breach.startedAt,
        },
      });
      breachesOpened += 1;
    }

    // A launch breach can stop applying without the project ever moving -
    // its target date can simply be pushed back. A stage breach cannot: the
    // only way to stop being over a fixed stage target is to leave the
    // stage, which `moveStage` already closes at the exact moment it happens.
    const launchStillOpen = detected.some((breach) => breach.kind === 'LAUNCH_OVERRUN');
    for (const row of existing) {
      if (row.kind === 'LAUNCH_OVERRUN' && !launchStillOpen) {
        // Never earlier than the row's own `startedAt` - the check constraint
        // enforces it, and clamping is more honest than crashing the sweep
        // over what can only be clock skew.
        const resolvedAt = row.startedAt > now ? row.startedAt : now;
        await db.slaBreach.update({ where: { id: row.id }, data: { resolvedAt } });
        breachesResolved += 1;
      }
    }
  }

  logger.info(
    { scanned: projects.length, changed, breachesOpened, breachesResolved },
    'health recomputed',
  );
}

/** Marks invoices overdue once their due date has passed. */
async function invoiceSweep(): Promise<void> {
  const now = clock.now();

  const overdue = await db.invoice.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: ['INVOICE_SENT', 'PARTIALLY_PAID'] },
    },
    select: {
      id: true,
      milestone: true,
      amountMinor: true,
      paidMinor: true,
      currency: true,
      project: {
        select: {
          id: true,
          code: true,
          merchant: { select: { name: true } },
          ahnProjectManagerId: true,
          shoplineAmId: true,
        },
      },
    },
  });

  for (const invoice of overdue) {
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'OVERDUE' } });

    const recipients = [invoice.project.ahnProjectManagerId, invoice.project.shoplineAmId].filter(
      (id): id is string => id !== null,
    );

    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        projectId: invoice.project.id,
        type: 'INVOICE_OVERDUE' as const,
        title: `${invoice.project.merchant.name}: ${invoice.milestone} is overdue`,
        body: `${formatMoney(invoice.amountMinor - invoice.paidMinor, invoice.currency)} outstanding.`,
        href: `/projects/${invoice.project.code}/invoices`,
        // One nag per invoice per person, ever - not one per night.
        dedupeKey: `invoice-overdue:${invoice.id}:${userId}`,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
  }

  if (overdue.length > 0) logger.info({ count: overdue.length }, 'invoices marked overdue');
}

/**
 * The nags the brief lists: unanswered introductions, missing access and
 * assets, inactivity, pending approvals and stages that have run long. Each one
 * is deduplicated per day so a project that stays stuck is mentioned once a day
 * rather than once a sweep.
 */
async function slaSweep(): Promise<void> {
  const { inactivityDays } = await loadThresholds();
  const now = clock.now();
  const today = now.toISOString().slice(0, 10);

  const projects = await db.project.findMany({
    where: { deletedAt: null, stage: { notIn: ['COMPLETED', 'DEPLOYED_LIVE'] } },
    select: {
      id: true,
      code: true,
      stage: true,
      lastActivityAt: true,
      merchant: { select: { name: true } },
      ahnProjectManagerId: true,
      ahnDeveloperId: true,
      shoplineAmId: true,
      shoplineSeId: true,
      members: { select: { userId: true } },
      stageEvents: {
        where: { exitedAt: null },
        select: { stage: true, enteredAt: true },
      },
      accessItems: { where: { blocking: true, status: { not: 'VERIFIED' } }, select: { id: true } },
      assetItems: {
        where: { required: true, status: { in: ['NOT_REQUESTED', 'REQUESTED'] } },
        select: { id: true },
      },
      approvals: { where: { status: 'PENDING' }, select: { type: true } },
      introEmails: {
        where: { status: 'SENT' },
        select: { id: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    },
  });

  const queued: Prisma.NotificationCreateManyInput[] = [];

  const add = (
    userIds: (string | null)[],
    input: {
      projectId: string;
      code: string;
      type: Prisma.NotificationCreateManyInput['type'];
      title: string;
      body: string;
      key: string;
      href?: string;
    },
  ) => {
    for (const userId of new Set(userIds.filter((id): id is string => id !== null))) {
      queued.push({
        userId,
        projectId: input.projectId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? `/projects/${input.code}`,
        dedupeKey: `${input.key}:${today}:${userId}`,
        createdAt: now,
      });
    }
  };

  for (const project of projects) {
    const ahn = [project.ahnProjectManagerId, project.ahnDeveloperId];
    const shopline = [project.shoplineAmId, project.shoplineSeId];
    const merchant = project.members.map((member) => member.userId);

    const intro = project.introEmails[0];
    if (intro?.sentAt && now.getTime() - intro.sentAt.getTime() > 3 * DAY_MS) {
      add([...shopline, ...ahn], {
        projectId: project.id,
        code: project.code,
        type: 'INTRODUCTION_UNANSWERED',
        title: `${project.merchant.name} has not replied to the introduction`,
        body: 'Sent more than three days ago with no recorded response.',
        key: `intro:${project.id}`,
      });
    }

    if (project.accessItems.length > 0) {
      add([...merchant, ...ahn], {
        projectId: project.id,
        code: project.code,
        type: 'ACCESS_MISSING',
        title: `${project.merchant.name}: ${project.accessItems.length} blocking access item(s) outstanding`,
        body: 'Migration cannot start until these are verified.',
        key: `access:${project.id}`,
        href: `/projects/${project.code}/access`,
      });
    }

    if (project.assetItems.length > 0) {
      add([...merchant, ...ahn], {
        projectId: project.id,
        code: project.code,
        type: 'ASSETS_MISSING',
        title: `${project.merchant.name}: ${project.assetItems.length} required asset(s) outstanding`,
        body: 'The build cannot be completed without them.',
        key: `assets:${project.id}`,
        href: `/projects/${project.code}/assets`,
      });
    }

    const inactiveFor = (now.getTime() - project.lastActivityAt.getTime()) / DAY_MS;
    if (inactiveFor > inactivityDays) {
      add([...ahn, ...shopline], {
        projectId: project.id,
        code: project.code,
        type: 'PROJECT_INACTIVE',
        title: `${project.merchant.name} has had no update for ${Math.floor(inactiveFor)} days`,
        body: 'A project nobody has written about is usually a project nobody is working on.',
        key: `inactive:${project.id}`,
      });
    }

    for (const approval of project.approvals) {
      add(approval.type === 'SHOPLINE_DEPLOYMENT' ? shopline : ahn, {
        projectId: project.id,
        code: project.code,
        type: 'APPROVAL_PENDING',
        title: `${project.merchant.name}: ${approval.type.toLowerCase().replace(/_/g, ' ')} approval pending`,
        body: 'Nothing moves until this is decided.',
        key: `approval:${project.id}:${approval.type}`,
        href: `/projects/${project.code}/approvals`,
      });
    }

    const open = project.stageEvents[0];
    const target = open ? STAGES[open.stage].targetDays : null;
    if (open && target !== null) {
      const dwell = (now.getTime() - open.enteredAt.getTime()) / DAY_MS;
      if (dwell > target * 1.5) {
        add([...ahn, ...shopline], {
          projectId: project.id,
          code: project.code,
          type: 'PROJECT_INACTIVE',
          title: `${project.merchant.name} has been in ${STAGES[open.stage].label} for ${Math.floor(dwell)} days`,
          body: `The target for this stage is ${target} days.`,
          key: `stage-overrun:${project.id}:${open.stage}`,
          href: `/projects/${project.code}/time`,
        });
      }
    }
  }

  if (queued.length > 0) {
    // `APPROVAL_PENDING` is the one type this sweep raises that is also in
    // `URGENT_NOTIFICATION_TYPES` (apps/web/src/server/record.ts - keep the
    // two lists in sync by hand, since this worker cannot import that web-only
    // helper). The bulk `createMany` below can't say which rows were
    // genuinely new versus silently skipped as a same-day repeat, so urgent
    // ones go through a per-row upsert instead, the same freshness check
    // `notify()` already uses, and only a fresh one earns an email + Slack DM.
    const urgent = queued.filter((n) => n.type === 'APPROVAL_PENDING');
    const rest = queued.filter((n) => n.type !== 'APPROVAL_PENDING');

    if (rest.length > 0) {
      await db.notification.createMany({ data: rest, skipDuplicates: true });
    }

    const fresh: Prisma.NotificationCreateManyInput[] = [];
    for (const notification of urgent) {
      const row = await db.notification.upsert({
        where: {
          userId_dedupeKey: { userId: notification.userId, dedupeKey: notification.dedupeKey! },
        },
        create: notification,
        update: { title: notification.title },
        select: { createdAt: true },
      });
      if (row.createdAt.getTime() === now.getTime()) fresh.push(notification);
    }
    if (fresh.length > 0) await queueUrgentApprovalDeliveries(fresh);
  }
  logger.info({ projects: projects.length, notifications: queued.length }, 'SLA sweep complete');
}

/**
 * A pending-approval nag that stays unread deserves the same email + Slack DM
 * every other urgent notification gets (D-039), not only an in-app row. This
 * mirrors `queueUrgentNotificationDeliveries` in apps/web/src/server/record.ts
 * rather than importing it - apps/worker cannot reach into apps/web's server
 * helpers, the same boundary D-037 already ran into for its test fixtures.
 */
async function queueUrgentApprovalDeliveries(
  notifications: readonly Prisma.NotificationCreateManyInput[],
): Promise<void> {
  const userIds = [...new Set(notifications.map((n) => n.userId))];
  const recipients = await db.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, email: true, name: true },
  });
  const byId = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  for (const notification of notifications) {
    const recipient = byId.get(notification.userId);
    if (!recipient) continue;

    const projectUrl = notification.href ? `${env().APP_URL}${notification.href}` : env().APP_URL;
    const rendered = renderNotificationEmail({
      recipientName: recipient.name,
      title: notification.title,
      body: notification.body ?? null,
      projectUrl,
    });

    await db.outboxMessage.create({
      data: {
        projectId: notification.projectId ?? null,
        provider: 'EMAIL',
        kind: 'notification',
        payload: {
          to: [{ name: recipient.name, email: recipient.email }],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        },
        availableAt: clock.now(),
      },
    });

    await db.outboxMessage.create({
      data: {
        projectId: notification.projectId ?? null,
        provider: 'SLACK',
        kind: 'notification_dm',
        payload: { email: recipient.email, title: notification.title, body: notification.body },
        availableAt: clock.now(),
      },
    });
  }
}

async function purgeSessions(): Promise<void> {
  const now = clock.now();
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  if (sessions.count > 0) logger.info({ count: sessions.count }, 'expired sessions purged');

  // Same idea, same schedule: an expired invite/reset link is not a security
  // risk left in place (it is already unusable - `consumePasswordToken`
  // checks `expiresAt` itself), just a row with no reason to keep existing.
  const tokens = await db.passwordToken.deleteMany({ where: { expiresAt: { lt: now } } });
  if (tokens.count > 0) logger.info({ count: tokens.count }, 'expired password tokens purged');
}
