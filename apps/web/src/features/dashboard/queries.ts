import 'server-only';
import {
  clock,
  DAY_MS,
  LINEAR_STAGES,
  STAGES,
  type AgingBand,
  type ProjectHealth,
  type ProjectStage,
  type Team,
} from '@relay/core';
import type { Principal } from '@relay/rbac';
import { listProjects, type ProjectListItem } from '@/features/projects/queries';

/**
 * The portfolio view. Every figure is derived from the same snapshots the
 * project pages use, so a number on the dashboard and the same number on a
 * project can never disagree.
 */
export interface PortfolioSummary {
  now: Date;
  total: number;
  active: number;
  completed: number;

  byStage: { stage: ProjectStage; count: number }[];
  byHealth: Record<ProjectHealth, number>;
  byAging: Record<AgingBand, number>;

  /** Averages across projects that have finished, plus the live ones. */
  avgTotalDurationMs: number | null;
  avgCompletedDurationMs: number | null;
  timeByTeam: Record<Team, number>;
  avgByTeam: Record<Team, number>;

  longestActive: ProjectListItem | null;
  overTarget: ProjectListItem[];
  onSchedule: number;
  noTargetDate: number;

  launchesThisMonth: ProjectListItem[];
  launchingSoon: ProjectListItem[];

  activeBlockers: {
    project: ProjectListItem;
    title: string;
    ownerTeam: Team;
    ownerName: string | null;
    startedAt: Date;
    ageMs: number;
    nextAction: string | null;
    dueDate: Date | null;
  }[];
  blockersByTeam: Record<Team, number>;

  launchBlockerCount: number;
  awaitingShopline: ProjectListItem[];
  awaitingMerchantApproval: ProjectListItem[];

  invoiceOutstandingMinor: number;
  invoiceOverdueCount: number;
  currency: string;

  inactive: ProjectListItem[];
  projects: ProjectListItem[];
}

const EMPTY_TEAM: Record<Team, number> = { AHN: 0, SHOPLINE: 0, MERCHANT: 0, OTHER: 0 };

export async function getPortfolioSummary(principal: Principal): Promise<PortfolioSummary> {
  const projects = await listProjects(principal, { includeCompleted: true, sort: 'recent' });
  const now = clock.now();

  const active = projects.filter((project) => project.stage !== 'COMPLETED');
  const completed = projects.filter((project) => project.stage === 'COMPLETED');

  const byStage = LINEAR_STAGES.concat('ON_HOLD_BLOCKED')
    .map((stage) => ({
      stage,
      count: projects.filter((project) => project.stage === stage).length,
    }))
    .filter((entry) => entry.count > 0 || STAGES[entry.stage].order !== null);

  const byHealth: Record<ProjectHealth, number> = { ON_TRACK: 0, AT_RISK: 0, BLOCKED: 0 };
  const byAging: Record<AgingBand, number> = { ON_TRACK: 0, ATTENTION: 0, DELAYED: 0, CRITICAL: 0 };
  const timeByTeam = { ...EMPTY_TEAM };
  const blockersByTeam = { ...EMPTY_TEAM };

  for (const project of active) {
    byHealth[project.snapshot.health.health] += 1;
    byAging[project.snapshot.time.agingBand] += 1;
    for (const team of Object.keys(timeByTeam) as Team[]) {
      timeByTeam[team] += project.snapshot.time.byTeam[team];
    }
    if (project.blocker) blockersByTeam[project.blocker.ownerTeam] += 1;
  }

  const avgByTeam = { ...EMPTY_TEAM };
  if (active.length > 0) {
    for (const team of Object.keys(avgByTeam) as Team[]) {
      avgByTeam[team] = timeByTeam[team] / active.length;
    }
  }

  const avgTotalDurationMs =
    active.length > 0
      ? active.reduce((sum, project) => sum + project.snapshot.time.ageMs, 0) / active.length
      : null;

  const avgCompletedDurationMs =
    completed.length > 0
      ? completed.reduce((sum, project) => sum + project.snapshot.time.ageMs, 0) / completed.length
      : null;

  const longestActive =
    [...active].sort((a, b) => b.snapshot.time.ageMs - a.snapshot.time.ageMs)[0] ?? null;

  const overTarget = active.filter((project) => project.snapshot.time.daysOverTarget > 0);
  const onSchedule = active.filter((project) => project.snapshot.time.onSchedule === true).length;
  const noTargetDate = active.filter((project) => project.targetLaunchDate === null).length;

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const launchesThisMonth = projects.filter(
    (project) =>
      project.targetLaunchDate !== null &&
      project.targetLaunchDate >= monthStart &&
      project.targetLaunchDate < monthEnd,
  );
  const launchingSoon = active
    .filter(
      (project) =>
        project.targetLaunchDate !== null &&
        project.targetLaunchDate.getTime() >= now.getTime() &&
        project.targetLaunchDate.getTime() <= now.getTime() + 21 * DAY_MS,
    )
    .sort((a, b) => (a.targetLaunchDate?.getTime() ?? 0) - (b.targetLaunchDate?.getTime() ?? 0));

  const activeBlockers = active
    .filter((project) => project.blocker !== null)
    .map((project) => ({
      project,
      title: project.blocker!.title,
      ownerTeam: project.blocker!.ownerTeam,
      ownerName: project.blocker!.ownerName,
      startedAt: project.blocker!.startedAt,
      ageMs: now.getTime() - project.blocker!.startedAt.getTime(),
      nextAction: project.blocker!.nextAction,
      dueDate: project.blocker!.dueDate,
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  const invoiceOutstandingMinor = projects.reduce(
    (sum, project) => sum + project.snapshot.invoice.outstandingMinor,
    0,
  );
  const invoiceOverdueCount = projects.filter((project) => project.snapshot.invoice.overdue).length;

  const inactive = active
    .filter(
      (project) =>
        project.snapshot.time.inactiveDays !== null && project.snapshot.time.inactiveDays > 7,
    )
    .sort((a, b) => (b.snapshot.time.inactiveDays ?? 0) - (a.snapshot.time.inactiveDays ?? 0));

  return {
    now,
    total: projects.length,
    active: active.length,
    completed: completed.length,
    byStage,
    byHealth,
    byAging,
    avgTotalDurationMs,
    avgCompletedDurationMs,
    timeByTeam,
    avgByTeam,
    longestActive,
    overTarget,
    onSchedule,
    noTargetDate,
    launchesThisMonth,
    launchingSoon,
    activeBlockers,
    blockersByTeam,
    launchBlockerCount: active.reduce(
      (sum, project) => sum + project.snapshot.launchBlockerCount,
      0,
    ),
    awaitingShopline: active.filter(
      (project) =>
        project.stage === 'READY_FOR_SHOPLINE_REVIEW' || project.stage === 'SHOPLINE_REVIEW',
    ),
    awaitingMerchantApproval: active.filter(
      (project) =>
        project.stage === 'MERCHANT_DESIGN_REVIEW' ||
        project.stage === 'MERCHANT_QA' ||
        project.approvals.MERCHANT_FINAL === 'PENDING',
    ),
    invoiceOutstandingMinor,
    invoiceOverdueCount,
    currency: projects[0]?.snapshot.invoice.currency ?? 'USD',
    inactive,
    projects,
  };
}
