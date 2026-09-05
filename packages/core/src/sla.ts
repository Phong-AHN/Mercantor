import { clock } from './clock';
import { TEAMS, type AgingBand, type ProjectStage, type Team } from './enums';
import {
  clampInterval,
  intervalLength,
  makeInterval,
  subtractIntervals,
  totalLength,
  type Interval,
} from './intervals';
import { STAGES } from './stages';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

/**
 * Configurable ageing indicators. The defaults are the ones the brief names;
 * they are stored as a portal setting so a operations lead can retune them
 * without a deploy.
 */
export interface AgingThresholds {
  /** Days at which a project stops being On Track. */
  attentionDays: number;
  delayedDays: number;
  criticalDays: number;
}

export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  attentionDays: 31,
  delayedDays: 46,
  criticalDays: 61,
};

/** Inactivity beyond this makes a project At Risk even when nothing is blocked. */
export const DEFAULT_INACTIVITY_DAYS = 7;

export function agingBand(
  ageDays: number,
  thresholds: AgingThresholds = DEFAULT_AGING_THRESHOLDS,
): AgingBand {
  if (ageDays >= thresholds.criticalDays) return 'CRITICAL';
  if (ageDays >= thresholds.delayedDays) return 'DELAYED';
  if (ageDays >= thresholds.attentionDays) return 'ATTENTION';
  return 'ON_TRACK';
}

/** One visit to one stage. Open segments have `exitedAt === null`. */
export interface StageSegmentInput {
  stage: ProjectStage;
  enteredAt: Date;
  exitedAt: Date | null;
  /** Overrides the stage default when a project agrees a different owner. */
  ownerTeam?: Team | null;
}

/** One ownership span of one blocker. */
export interface BlockerSegmentInput {
  blockerId: string;
  ownerTeam: Team;
  startedAt: Date;
  endedAt: Date | null;
}

export interface ProjectTimeInput {
  startedAt: Date;
  targetLaunchDate?: Date | null;
  /** When set, the clock stops here instead of at `now`. */
  completedAt?: Date | null;
  stageSegments: readonly StageSegmentInput[];
  blockerSegments?: readonly BlockerSegmentInput[];
  lastActivityAt?: Date | null;
  thresholds?: AgingThresholds;
  now?: Date;
}

export interface StageTimeBreakdown {
  stage: ProjectStage;
  totalMs: number;
  visits: number;
  targetMs: number | null;
  /** True when this stage alone has consumed more than its target. */
  overTarget: boolean;
}

export interface ProjectTime {
  now: Date;
  startedAt: Date;
  /** Wall-clock age from start to completion, or to now while running. */
  ageMs: number;
  ageDays: number;
  agingBand: AgingBand;

  currentStage: ProjectStage | null;
  currentStageEnteredAt: Date | null;
  currentStageMs: number;
  currentStageTargetMs: number | null;
  currentStageOverTarget: boolean;

  /** Time per stage, summed across repeat visits. */
  byStage: StageTimeBreakdown[];
  /** Where the elapsed time went. Blocker ownership overrides stage ownership. */
  byTeam: Record<Team, number>;
  /** `byTeam` as whole-percent shares that add to 100. */
  byTeamPercent: Record<Team, number>;

  targetLaunchDate: Date | null;
  /** Positive = days of slack remaining. Negative = days past target. */
  daysToTarget: number | null;
  daysOverTarget: number;
  onSchedule: boolean | null;

  inactiveDays: number | null;
  totalBlockedMs: number;
}

function daysBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / DAY_MS;
}

/**
 * The single time model behind every number the portal shows: project age,
 * stage dwell, and - the one that settles arguments - which side of the table
 * the elapsed time belongs to.
 *
 * Attribution rule: while a blocker is open, its owner is charged, whatever
 * stage the project is sitting in. Time with no open blocker is charged to the
 * stage's owning team. No millisecond is ever charged twice.
 */
export function computeProjectTime(input: ProjectTimeInput): ProjectTime {
  const now = input.now ?? clock.now();
  const stopAt = input.completedAt ?? now;
  const bounds: Interval = {
    start: input.startedAt.getTime(),
    end: Math.max(stopAt.getTime(), input.startedAt.getTime()),
  };

  const thresholds = input.thresholds ?? DEFAULT_AGING_THRESHOLDS;
  const ageMs = intervalLength(bounds);
  const ageDays = ageMs / DAY_MS;

  // --- blocker time is claimed first ------------------------------------
  const blockerClaims: { team: Team; interval: Interval }[] = [];
  const claimed: Interval[] = [];
  const sortedBlockers = [...(input.blockerSegments ?? [])].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
  for (const segment of sortedBlockers) {
    const raw = clampInterval(makeInterval(segment.startedAt, segment.endedAt, stopAt), bounds);
    if (!raw) continue;
    // Two blockers open at once must not both charge the same millisecond;
    // the one that opened first keeps it.
    for (const piece of subtractIntervals(raw, claimed)) {
      blockerClaims.push({ team: segment.ownerTeam, interval: piece });
      claimed.push(piece);
    }
  }

  const byTeam: Record<Team, number> = { AHN: 0, SHOPLINE: 0, MERCHANT: 0, OTHER: 0 };
  for (const claim of blockerClaims) {
    byTeam[claim.team] += intervalLength(claim.interval);
  }
  const totalBlockedMs = totalLength(claimed);

  // --- what is left is charged to the stage owner ------------------------
  const stageTotals = new Map<ProjectStage, { totalMs: number; visits: number }>();
  let currentStage: ProjectStage | null = null;
  let currentStageEnteredAt: Date | null = null;
  let currentStageMs = 0;

  const orderedSegments = [...input.stageSegments].sort(
    (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime(),
  );

  for (const segment of orderedSegments) {
    const raw = clampInterval(makeInterval(segment.enteredAt, segment.exitedAt, stopAt), bounds);
    if (raw) {
      const entry = stageTotals.get(segment.stage) ?? { totalMs: 0, visits: 0 };
      entry.totalMs += intervalLength(raw);
      entry.visits += 1;
      stageTotals.set(segment.stage, entry);

      const owner = segment.ownerTeam ?? STAGES[segment.stage].ownerTeam;
      for (const piece of subtractIntervals(raw, claimed)) {
        byTeam[owner] += intervalLength(piece);
      }
    }

    if (segment.exitedAt === null) {
      currentStage = segment.stage;
      currentStageEnteredAt = segment.enteredAt;
      currentStageMs = raw ? intervalLength(raw) : 0;
    }
  }

  const byStage: StageTimeBreakdown[] = [...stageTotals.entries()]
    .map(([stage, entry]) => {
      const targetDays = STAGES[stage].targetDays;
      const targetMs = targetDays === null ? null : targetDays * DAY_MS;
      return {
        stage,
        totalMs: entry.totalMs,
        visits: entry.visits,
        targetMs,
        overTarget: targetMs !== null && entry.totalMs > targetMs,
      };
    })
    .sort((a, b) => (STAGES[a.stage].order ?? 99) - (STAGES[b.stage].order ?? 99));

  const attributed = TEAMS.reduce((sum, team) => sum + byTeam[team], 0);
  const byTeamPercent: Record<Team, number> = { AHN: 0, SHOPLINE: 0, MERCHANT: 0, OTHER: 0 };
  if (attributed > 0) {
    let allocated = 0;
    TEAMS.forEach((team, index) => {
      if (index === TEAMS.length - 1) {
        byTeamPercent[team] = Math.max(0, 100 - allocated);
      } else {
        const share = Math.round((byTeam[team] / attributed) * 100);
        byTeamPercent[team] = share;
        allocated += share;
      }
    });
  }

  const currentTargetDays = currentStage ? STAGES[currentStage].targetDays : null;
  const currentStageTargetMs = currentTargetDays === null ? null : currentTargetDays * DAY_MS;

  const targetLaunchDate = input.targetLaunchDate ?? null;
  const daysToTarget = targetLaunchDate
    ? daysBetween(stopAt.getTime(), targetLaunchDate.getTime())
    : null;
  const daysOverTarget = daysToTarget !== null && daysToTarget < 0 ? Math.abs(daysToTarget) : 0;

  const inactiveDays = input.lastActivityAt
    ? daysBetween(input.lastActivityAt.getTime(), now.getTime())
    : null;

  return {
    now,
    startedAt: input.startedAt,
    ageMs,
    ageDays,
    agingBand: agingBand(ageDays, thresholds),
    currentStage,
    currentStageEnteredAt,
    currentStageMs,
    currentStageTargetMs,
    currentStageOverTarget: currentStageTargetMs !== null && currentStageMs > currentStageTargetMs,
    byStage,
    byTeam,
    byTeamPercent,
    targetLaunchDate,
    daysToTarget,
    daysOverTarget,
    onSchedule: daysToTarget === null ? null : daysToTarget >= 0,
    inactiveDays,
    totalBlockedMs,
  };
}

/** What a formal `SlaBreach` row should say, before it has one. See `SlaBreach` in the schema. */
export interface OpenBreach {
  kind: 'STAGE_OVERRUN' | 'LAUNCH_OVERRUN';
  /** Set for STAGE_OVERRUN, null for LAUNCH_OVERRUN. */
  stage: ProjectStage | null;
  /** The target (days) that was crossed. Null for LAUNCH_OVERRUN. */
  targetDays: number | null;
  /** The exact moment the threshold was crossed, not when this was noticed. */
  startedAt: Date;
}

/**
 * What SLA breaches should be open right now, derived purely from the time
 * model that already exists - not a second computation with its own chance to
 * disagree with `currentStageOverTarget` / `onSchedule`. `startedAt` is backed
 * out from data already on hand (`currentStageEnteredAt` plus the stage's own
 * target, or the target launch date itself), so a breach detected an hour or
 * a day late still records the moment it actually began, not the moment a
 * sweep happened to notice.
 */
export function detectOpenBreaches(time: ProjectTime): OpenBreach[] {
  const breaches: OpenBreach[] = [];

  if (
    time.currentStageOverTarget &&
    time.currentStage !== null &&
    time.currentStageEnteredAt !== null &&
    time.currentStageTargetMs !== null
  ) {
    breaches.push({
      kind: 'STAGE_OVERRUN',
      stage: time.currentStage,
      targetDays: time.currentStageTargetMs / DAY_MS,
      startedAt: new Date(time.currentStageEnteredAt.getTime() + time.currentStageTargetMs),
    });
  }

  if (time.onSchedule === false && time.targetLaunchDate !== null) {
    breaches.push({
      kind: 'LAUNCH_OVERRUN',
      stage: null,
      targetDays: null,
      startedAt: time.targetLaunchDate,
    });
  }

  return breaches;
}
