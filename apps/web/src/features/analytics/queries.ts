import 'server-only';
import { bucketOf, clock, trailingMonths, type MonthBucket } from '@relay/core';
import { db } from '@relay/db';
import { projectScopeWhere, type Principal } from '@relay/rbac';
import { listProjects } from '@/features/projects/queries';

/**
 * Trends over time, not a live snapshot - the dashboard already answers
 * "where does everything stand right now"; this answers "is it getting
 * better or worse". Reuses `listProjects` for the project list for the same
 * reason the dashboard does (D-007's "one source of truth"): a separate
 * project query here could count a project the portfolio screen would not.
 * No new schema - every number is derived from columns and rows that already
 * exist (`Project.startDate`/`actualLaunchDate`/`completedAt`, `SlaBreach`).
 */

const MONTHS = 6;

export interface MonthlyTrend {
  key: string;
  label: string;
  started: number;
  launched: number;
  /** Average days from start to launch, for projects that launched this month. Null when none did. */
  avgCycleTimeDays: number | null;
  stageBreaches: number;
  launchBreaches: number;
}

export interface AnalyticsTrends {
  monthsCount: number;
  months: MonthlyTrend[];
  totalStarted: number;
  totalLaunched: number;
  /** Across every month in the window, not just the most recent one. */
  avgCycleTimeDays: number | null;
  totalBreaches: number;
}

const DAY_MS = 86_400_000;

function emptyTrend(month: MonthBucket): MonthlyTrend {
  return {
    key: month.key,
    label: month.label,
    started: 0,
    launched: 0,
    avgCycleTimeDays: null,
    stageBreaches: 0,
    launchBreaches: 0,
  };
}

export async function getAnalyticsTrends(principal: Principal): Promise<AnalyticsTrends> {
  const now = clock.now();
  const months = trailingMonths(MONTHS, now);
  const rangeStart = months[0]!.start;

  const [projects, breaches] = await Promise.all([
    listProjects(principal, { includeCompleted: true, sort: 'recent' }),
    db.slaBreach.findMany({
      where: { startedAt: { gte: rangeStart }, project: projectScopeWhere(principal) },
      select: { kind: true, startedAt: true },
    }),
  ]);

  const byKey = new Map(months.map((month) => [month.key, emptyTrend(month)]));
  const cycleTimesByMonth = new Map<string, number[]>();

  for (const project of projects) {
    const startBucket = bucketOf(project.startDate, months);
    if (startBucket) byKey.get(startBucket)!.started += 1;

    // "Launched" means the store actually went live; a completed project
    // that never recorded a live date (an edge case, not the common one)
    // still counts by its completion date rather than not at all.
    const launchedAt = project.actualLaunchDate ?? project.completedAt;
    if (!launchedAt) continue;
    const launchBucket = bucketOf(launchedAt, months);
    if (!launchBucket) continue;

    byKey.get(launchBucket)!.launched += 1;
    const cycleDays = (launchedAt.getTime() - project.startDate.getTime()) / DAY_MS;
    cycleTimesByMonth.set(launchBucket, [
      ...(cycleTimesByMonth.get(launchBucket) ?? []),
      cycleDays,
    ]);
  }

  for (const [key, durations] of cycleTimesByMonth) {
    byKey.get(key)!.avgCycleTimeDays = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  for (const breach of breaches) {
    const bucket = bucketOf(breach.startedAt, months);
    if (!bucket) continue;
    const point = byKey.get(bucket)!;
    if (breach.kind === 'STAGE_OVERRUN') point.stageBreaches += 1;
    else point.launchBreaches += 1;
  }

  const trendMonths = months.map((month) => byKey.get(month.key)!);
  const allCycleTimes = [...cycleTimesByMonth.values()].flat();

  return {
    monthsCount: MONTHS,
    months: trendMonths,
    totalStarted: trendMonths.reduce((sum, m) => sum + m.started, 0),
    totalLaunched: trendMonths.reduce((sum, m) => sum + m.launched, 0),
    avgCycleTimeDays:
      allCycleTimes.length > 0
        ? allCycleTimes.reduce((sum, d) => sum + d, 0) / allCycleTimes.length
        : null,
    totalBreaches: trendMonths.reduce((sum, m) => sum + m.stageBreaches + m.launchBreaches, 0),
  };
}
