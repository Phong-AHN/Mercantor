import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { fixedClock, resetClock, setClock } from '@relay/core';
import { db } from '@relay/db';
import { cleanupFixtures, createTestUser, signInAs, type TestUser } from '../../../test/fixtures';
import { getAnalyticsTrends } from './queries';

/**
 * Frozen far in the future - 2030, nowhere near any seeded demo date (all
 * relative to whenever `pnpm db:seed` last ran, always within a couple of
 * months of the real "now") - so `trailingMonths(6)` gives a six-month
 * window with nothing in it but this file's own fixtures. No pollution
 * accounting needed, unlike the whole-database worker sweeps.
 */
const NOW = new Date('2030-03-15T00:00:00.000Z');

const projectIds: string[] = [];
const merchantIds: string[] = [];

async function createProjectWithDates(input: {
  startDate: Date;
  actualLaunchDate?: Date;
  completedAt?: Date;
}): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const merchant = await db.merchant.create({
    data: { name: `Analytics Test Merchant ${suffix}` },
  });
  merchantIds.push(merchant.id);

  const project = await db.project.create({
    data: {
      code: `PRJ-ANALYTICS-${suffix}`,
      merchantId: merchant.id,
      startDate: input.startDate,
      actualLaunchDate: input.actualLaunchDate ?? null,
      completedAt: input.completedAt ?? null,
      stage: input.completedAt
        ? 'COMPLETED'
        : input.actualLaunchDate
          ? 'DEPLOYED_LIVE'
          : 'INTRODUCTION',
    },
  });
  projectIds.push(project.id);
  return project.id;
}

async function cleanupProjects(): Promise<void> {
  if (projectIds.length > 0) {
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    projectIds.length = 0;
  }
  if (merchantIds.length > 0) {
    await db.merchant.deleteMany({ where: { id: { in: merchantIds } } });
    merchantIds.length = 0;
  }
}

describe('getAnalyticsTrends', () => {
  let pm: TestUser;

  afterEach(async () => {
    resetClock();
    await cleanupProjects();
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('buckets started/launched projects and SLA breaches by calendar month, and averages cycle time per month', async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    await signInAs(pm);
    setClock(fixedClock(NOW));

    // Started December, launched January - a 40-day cycle.
    const projectA = await createProjectWithDates({
      startDate: new Date('2029-12-01T00:00:00.000Z'),
      actualLaunchDate: new Date('2030-01-10T00:00:00.000Z'),
    });
    // Started January, completed February (no actualLaunchDate) - a 27-day cycle.
    await createProjectWithDates({
      startDate: new Date('2030-01-05T00:00:00.000Z'),
      completedAt: new Date('2030-02-01T00:00:00.000Z'),
    });
    // Started years before the trailing window - must not count as "started".
    await createProjectWithDates({ startDate: new Date('2020-01-01T00:00:00.000Z') });

    await db.slaBreach.create({
      data: {
        projectId: projectA,
        kind: 'STAGE_OVERRUN',
        stage: 'DEVELOPMENT',
        targetDays: 10,
        startedAt: new Date('2030-01-20T00:00:00.000Z'),
      },
    });
    await db.slaBreach.create({
      data: {
        projectId: projectA,
        kind: 'LAUNCH_OVERRUN',
        stage: null,
        targetDays: null,
        startedAt: new Date('2029-12-15T00:00:00.000Z'),
      },
    });

    const trends = await getAnalyticsTrends(pm);

    expect(trends.months.map((m) => m.key)).toEqual([
      '2029-10',
      '2029-11',
      '2029-12',
      '2030-01',
      '2030-02',
      '2030-03',
    ]);

    const dec = trends.months.find((m) => m.key === '2029-12')!;
    expect(dec.started).toBe(1);
    expect(dec.launched).toBe(0);
    expect(dec.launchBreaches).toBe(1);
    expect(dec.stageBreaches).toBe(0);

    const jan = trends.months.find((m) => m.key === '2030-01')!;
    expect(jan.started).toBe(1);
    expect(jan.launched).toBe(1);
    expect(jan.avgCycleTimeDays).toBe(40);
    expect(jan.stageBreaches).toBe(1);

    const feb = trends.months.find((m) => m.key === '2030-02')!;
    expect(feb.started).toBe(0);
    expect(feb.launched).toBe(1);
    expect(feb.avgCycleTimeDays).toBe(27);

    // The project started in 2020 is outside the six-month window entirely.
    expect(trends.totalStarted).toBe(2);
    expect(trends.totalLaunched).toBe(2);
    expect(trends.totalBreaches).toBe(2);
    expect(trends.avgCycleTimeDays).toBe(33.5);
  });

  it('reports an empty trend with no throwaway data in the window', async () => {
    pm = await createTestUser('AHN_PROJECT_MANAGER');
    await signInAs(pm);
    setClock(fixedClock(NOW));

    const trends = await getAnalyticsTrends(pm);

    expect(trends.totalStarted).toBe(0);
    expect(trends.totalLaunched).toBe(0);
    expect(trends.totalBreaches).toBe(0);
    expect(trends.avgCycleTimeDays).toBeNull();
    expect(trends.months.every((m) => m.avgCycleTimeDays === null)).toBe(true);
  });
});
