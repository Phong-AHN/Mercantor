import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DAY_MS, fixedClock, resetClock, setClock } from '@relay/core';
import { db } from '@relay/db';
import { processMaintenance } from './maintenance';

/**
 * "Each nag is deduplicated per day so a project that stays stuck is
 * mentioned once a day rather than once a sweep" - the comment on
 * `slaSweep` states the guarantee; this proves it against the real
 * dedupe mechanism (`Notification.dedupeKey`, unique per user, and
 * `skipDuplicates: true`), not a mock of it.
 *
 * Self-contained rather than reusing `apps/web/test/fixtures.ts`: this
 * package's `tsconfig.json` scopes `rootDir` to its own `src`, and a
 * server action's fixtures pull in `next/headers`/the `@` alias that only
 * make sense inside `apps/web`. A minimal project with one unmet blocking
 * access item is all `slaSweep`'s `ACCESS_MISSING` branch needs.
 */
async function createMinimalProject(): Promise<{ projectId: string; pmId: string }> {
  const suffix = randomUUID().slice(0, 8);

  const merchant = await db.merchant.create({ data: { name: `Sweep Test Merchant ${suffix}` } });
  const pm = await db.user.create({
    data: {
      email: `sweep-pm-${suffix}@relay.test`,
      name: `Sweep PM ${suffix}`,
      passwordHash: 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk',
      role: 'AHN_PROJECT_MANAGER',
      team: 'AHN',
    },
  });
  const project = await db.project.create({
    data: {
      code: `PRJ-SWEEP-${suffix}`,
      merchantId: merchant.id,
      ahnProjectManagerId: pm.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  await db.accessItem.create({
    data: {
      projectId: project.id,
      kind: 'SHOPLINE_ADMIN',
      label: 'SHOPLINE store admin access',
      blocking: true,
      // status defaults to NOT_REQUESTED - unmet, which is the point.
    },
  });

  return { projectId: project.id, pmId: pm.id };
}

async function createProjectWithPendingApproval(): Promise<{
  projectId: string;
  pm: { id: string; email: string; name: string };
}> {
  const suffix = randomUUID().slice(0, 8);
  const merchant = await db.merchant.create({
    data: { name: `Approval Sweep Merchant ${suffix}` },
  });
  const pm = await db.user.create({
    data: {
      email: `approval-sweep-pm-${suffix}@relay.test`,
      name: `Approval Sweep PM ${suffix}`,
      passwordHash: 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk',
      role: 'AHN_PROJECT_MANAGER',
      team: 'AHN',
    },
    select: { id: true, email: true, name: true },
  });
  const project = await db.project.create({
    data: {
      code: `PRJ-APPROVAL-${suffix}`,
      merchantId: merchant.id,
      ahnProjectManagerId: pm.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  await db.approval.create({
    data: {
      projectId: project.id,
      type: 'DESIGN',
      status: 'PENDING',
      requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  return { projectId: project.id, pm };
}

async function cleanup(projectId: string): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { merchantId: true },
  });
  if (!project) return;
  await db.project.delete({ where: { id: projectId } });
  await db.merchant.delete({ where: { id: project.merchantId } });
}

/**
 * A project with a real open `StageEvent`, which `createMinimalProject`
 * above deliberately has none of - `recomputeHealth`'s breach detection
 * reads `currentStage`/`currentStageEnteredAt` straight from `computeProjectTime`,
 * which has nothing to report without one.
 */
async function createProjectInStage(input: {
  stage: 'DEVELOPMENT' | 'DEPLOYED_LIVE';
  enteredAt: Date;
  targetLaunchDate?: Date;
}): Promise<{ projectId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const merchant = await db.merchant.create({ data: { name: `Breach Test Merchant ${suffix}` } });
  const pm = await db.user.create({
    data: {
      email: `breach-pm-${suffix}@relay.test`,
      name: `Breach PM ${suffix}`,
      passwordHash: 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk',
      role: 'AHN_PROJECT_MANAGER',
      team: 'AHN',
    },
  });
  const project = await db.project.create({
    data: {
      code: `PRJ-BREACH-${suffix}`,
      merchantId: merchant.id,
      ahnProjectManagerId: pm.id,
      startDate: input.enteredAt,
      targetLaunchDate: input.targetLaunchDate ?? null,
      stage: input.stage,
      stageEvents: { create: { stage: input.stage, enteredAt: input.enteredAt } },
    },
  });
  return { projectId: project.id };
}

/**
 * `slaSweep()` is deliberately whole-database, not project-scoped - it also
 * nags about every seeded demo project, not just this file's fixture. A
 * frozen future date makes that harmless to clean up precisely: nothing a
 * real sweep writes today can carry `2026-09-10` or `2026-09-11` in its
 * dedupeKey, so deleting by that substring removes exactly what these tests
 * caused, everywhere in the database, and nothing else.
 */
const TEST_DATES = ['2026-09-10', '2026-09-11'];

describe('SLA sweep dedupe-by-day', () => {
  afterEach(async () => {
    resetClock();
    await db.notification.deleteMany({
      where: { OR: TEST_DATES.map((date) => ({ dedupeKey: { contains: date } })) },
    });
  });

  it('queues one ACCESS_MISSING notification for the PM the first time it runs', async () => {
    const { projectId, pmId } = await createMinimalProject();
    try {
      setClock(fixedClock('2026-09-10T09:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      const notifications = await db.notification.findMany({
        where: { projectId, type: 'ACCESS_MISSING' },
        select: { userId: true, dedupeKey: true },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.userId).toBe(pmId);
      expect(notifications[0]?.dedupeKey).toBe(`access:${projectId}:2026-09-10:${pmId}`);
    } finally {
      await cleanup(projectId);
    }
  });

  it('running it again later the same day adds nothing more', async () => {
    const { projectId } = await createMinimalProject();
    try {
      setClock(fixedClock('2026-09-10T09:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      setClock(fixedClock('2026-09-10T21:45:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      const count = await db.notification.count({ where: { projectId, type: 'ACCESS_MISSING' } });
      expect(count).toBe(1);
    } finally {
      await cleanup(projectId);
    }
  });

  it('running it the next day queues a fresh one, under a new dedupe key', async () => {
    const { projectId, pmId } = await createMinimalProject();
    try {
      setClock(fixedClock('2026-09-10T09:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      setClock(fixedClock('2026-09-11T09:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      const notifications = await db.notification.findMany({
        where: { projectId, type: 'ACCESS_MISSING' },
        select: { dedupeKey: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(notifications).toHaveLength(2);
      expect(notifications.map((n) => n.dedupeKey)).toEqual([
        `access:${projectId}:2026-09-10:${pmId}`,
        `access:${projectId}:2026-09-11:${pmId}`,
      ]);
    } finally {
      await cleanup(projectId);
    }
  });
});

/**
 * Formal SLA breach records (D-041): `recomputeHealth`'s own pass, which
 * already runs `computeProjectTime` for every project, also opens
 * `SlaBreach` rows from that same result via `detectOpenBreaches` - not a
 * second, separate computation of "is this over target".
 */
describe('SLA breach detection (D-041)', () => {
  afterEach(resetClock);

  it('opens a STAGE_OVERRUN breach once the current stage has run past its target, dated to the exact crossing, and never duplicates it', async () => {
    const { projectId } = await createProjectInStage({
      stage: 'DEVELOPMENT',
      enteredAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    try {
      setClock(fixedClock('2026-08-20T00:00:00.000Z'));
      await processMaintenance({ task: 'recompute-health' });

      const breaches = await db.slaBreach.findMany({
        where: { projectId, kind: 'STAGE_OVERRUN' },
      });
      expect(breaches).toHaveLength(1);
      expect(breaches[0]?.stage).toBe('DEVELOPMENT');
      expect(breaches[0]?.targetDays).toBe(10);
      expect(breaches[0]?.resolvedAt).toBeNull();
      // DEVELOPMENT's target is 10 days - the breach began 10 days after entry,
      // not on 2026-08-20 when this sweep happened to notice it.
      expect(breaches[0]?.startedAt.toISOString()).toBe(
        new Date(new Date('2026-08-01T00:00:00.000Z').getTime() + 10 * DAY_MS).toISOString(),
      );

      await processMaintenance({ task: 'recompute-health' });
      const stillOne = await db.slaBreach.count({ where: { projectId, kind: 'STAGE_OVERRUN' } });
      expect(stillOne).toBe(1);
    } finally {
      await cleanup(projectId);
    }
  });

  it('opens a LAUNCH_OVERRUN breach once the target launch date has passed, and resolves it once the date is pushed back out', async () => {
    const { projectId } = await createProjectInStage({
      stage: 'DEPLOYED_LIVE',
      enteredAt: new Date('2026-08-01T00:00:00.000Z'),
      targetLaunchDate: new Date('2026-08-15T00:00:00.000Z'),
    });
    try {
      setClock(fixedClock('2026-08-20T00:00:00.000Z'));
      await processMaintenance({ task: 'recompute-health' });

      let breach = await db.slaBreach.findFirst({ where: { projectId, kind: 'LAUNCH_OVERRUN' } });
      expect(breach?.resolvedAt).toBeNull();
      expect(breach?.startedAt.toISOString()).toBe('2026-08-15T00:00:00.000Z');

      // The date is pushed out past "now" - no longer over target.
      await db.project.update({
        where: { id: projectId },
        data: { targetLaunchDate: new Date('2026-09-01T00:00:00.000Z') },
      });
      await processMaintenance({ task: 'recompute-health' });

      breach = await db.slaBreach.findFirst({ where: { id: breach!.id } });
      expect(breach?.resolvedAt).not.toBeNull();
    } finally {
      await cleanup(projectId);
    }
  });

  it('never resolves a breach earlier than it started, even if the sweep runs against an earlier "now"', async () => {
    // Simulates a row whose `startedAt` is, for whatever reason (clock skew,
    // a sweep run against a frozen past date after a real one already ran),
    // later than the "now" this particular sweep call uses - the check
    // constraint (`resolvedAt >= startedAt`) would otherwise reject the write.
    const { projectId } = await createProjectInStage({
      stage: 'DEPLOYED_LIVE',
      enteredAt: new Date('2026-08-01T00:00:00.000Z'),
      targetLaunchDate: new Date('2026-09-10T00:00:00.000Z'),
    });
    const seeded = await db.slaBreach.create({
      data: {
        projectId,
        kind: 'LAUNCH_OVERRUN',
        stage: null,
        targetDays: null,
        startedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });
    try {
      // Earlier than the seeded row's own startedAt - the project is not
      // over its (later) target at this frozen instant, so the sweep tries
      // to resolve a breach that, on paper, has not started yet.
      setClock(fixedClock('2026-08-20T00:00:00.000Z'));
      await processMaintenance({ task: 'recompute-health' });

      const resolved = await db.slaBreach.findUniqueOrThrow({ where: { id: seeded.id } });
      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.resolvedAt!.getTime()).toBeGreaterThanOrEqual(resolved.startedAt.getTime());
      expect(resolved.resolvedAt!.toISOString()).toBe(resolved.startedAt.toISOString());
    } finally {
      await cleanup(projectId);
    }
  });
});

/**
 * `APPROVAL_PENDING` is the one type this sweep raises that is also urgent
 * (`URGENT_NOTIFICATION_TYPES` in apps/web/src/server/record.ts) - a stale
 * approval nobody has decided on deserves the same email + Slack DM every
 * other urgent notification gets, not only an in-app row nobody may be
 * looking at. Found during a manual review: the sweep wrote the in-app
 * `Notification` directly via `createMany`, bypassing `notify()` entirely.
 */
describe('SLA sweep urgent delivery for a pending approval', () => {
  afterEach(resetClock);

  it('queues an email and a Slack DM the first time, and neither again the same day', async () => {
    const { projectId, pm } = await createProjectWithPendingApproval();
    try {
      setClock(fixedClock('2026-09-20T09:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      const notification = await db.notification.findFirstOrThrow({
        where: { userId: pm.id, projectId, type: 'APPROVAL_PENDING' },
      });
      expect(notification.dedupeKey).toContain('2026-09-20');

      const emails = await db.outboxMessage.findMany({
        where: { projectId, provider: 'EMAIL', kind: 'notification' },
      });
      const dms = await db.outboxMessage.findMany({
        where: { projectId, provider: 'SLACK', kind: 'notification_dm' },
      });
      expect(emails).toHaveLength(1);
      expect(dms).toHaveLength(1);
      expect((dms[0]?.payload as { email: string }).email).toBe(pm.email);
      expect((emails[0]?.payload as { to: { email: string }[] }).to[0]?.email).toBe(pm.email);

      // Later the same day: the same dedupe key, no second delivery queued.
      setClock(fixedClock('2026-09-20T21:00:00.000Z'));
      await processMaintenance({ task: 'sla-sweep' });

      const emailsAfter = await db.outboxMessage.findMany({
        where: { projectId, provider: 'EMAIL', kind: 'notification' },
      });
      expect(emailsAfter).toHaveLength(1);
    } finally {
      await cleanup(projectId);
    }
  });
});

/**
 * D-051: an expired invite/reset link is not a security risk left sitting
 * around (`consumePasswordToken` already checks `expiresAt` itself), just a
 * row with no reason to keep - `purge-expired-sessions` now clears both in
 * the same sweep, on the same schedule.
 */
describe('purge-expired-sessions also clears expired password tokens', () => {
  it('deletes an expired token, leaves an unexpired one alone', async () => {
    const user = await db.user.create({
      data: {
        email: `it-purge-${randomUUID().slice(0, 8)}@relay.test`,
        name: 'Purge Test User',
        passwordHash: 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk',
        role: 'AHN_DEVELOPER',
        team: 'AHN',
        isActive: true,
      },
    });

    try {
      const expired = await db.passwordToken.create({
        data: {
          userId: user.id,
          purpose: 'RESET',
          tokenHash: `expired-${randomUUID()}`,
          expiresAt: new Date(Date.now() - 1_000),
        },
      });
      const live = await db.passwordToken.create({
        data: {
          userId: user.id,
          purpose: 'INVITE',
          tokenHash: `live-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await processMaintenance({ task: 'purge-expired-sessions' });

      const remaining = await db.passwordToken.findMany({ where: { userId: user.id } });
      expect(remaining.map((row) => row.id)).toEqual([live.id]);
      expect(remaining.map((row) => row.id)).not.toContain(expired.id);
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
