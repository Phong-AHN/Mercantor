/**
 * The three numbers at the top of a project card.
 *
 * The reference project page leads with a measured pair — "375 → 104 requests
 * to load the homepage", "10.2 → 1.9 MB" — and those numbers do more work than
 * any sentence on the page. They are also the easiest thing in the product to
 * get quietly wrong: measure the before on a cold cache and the after warm,
 * compare a mobile run against a desktop one, or keep quoting a figure from a
 * test that ran four months ago, and the page becomes a nicely typeset lie.
 *
 * So the rules live here, next to the numbers, rather than in whichever screen
 * happens to render them.
 */

import { clock } from '@relay/core';

export type MetricDirection = 'LOWER_IS_BETTER' | 'HIGHER_IS_BETTER' | 'NEUTRAL';

export interface MetricPair {
  label: string;
  before: number | null;
  after: number | null;
  unit?: string | null;
  direction: MetricDirection;
}

export interface MetricDelta extends MetricPair {
  /** Signed change, in the metric's own unit. Null when a side is missing. */
  change: number | null;
  /** Percentage change, rounded to a whole number. Null when before is 0. */
  changePercent: number | null;
  /** Is this an improvement, by this metric's own definition of better? */
  improved: boolean | null;
  /** "375 → 104", ready to print. */
  display: string;
}

/**
 * One comparable measurement from a performance run.
 *
 * `device` and `template` are part of the contract, not decoration: a pair is
 * only honest when both sides measured the same template on the same device.
 */
export interface PerfSample {
  id: string;
  template: string;
  device: string;
  measuredAt: Date;
  requestCount?: number | null;
  thirdPartyHosts?: number | null;
  thirdPartyRequests?: number | null;
  pageWeightBytes?: number | null;
  lcpMs?: number | null;
  performanceScore?: number | null;
}

const BYTES_IN_MB = 1024 * 1024;

/** How many decimals a unit deserves. Requests are whole; megabytes are not. */
function round(value: number, unit?: string | null): number {
  if (unit === 'MB' || unit === 's') return Math.round(value * 10) / 10;
  return Math.round(value);
}

export function formatMetricValue(value: number | null, unit?: string | null): string {
  if (value === null) return '—';
  const rounded = round(value, unit);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return unit && unit !== 'pages' && unit !== 'requests' && unit !== 'hosts'
    ? `${text} ${unit}`
    : text;
}

export function describeMetric(pair: MetricPair): MetricDelta {
  const { before, after, direction } = pair;

  const change = before !== null && after !== null ? after - before : null;
  const changePercent =
    before !== null && after !== null && before !== 0
      ? Math.round(((after - before) / before) * 100)
      : null;

  let improved: boolean | null = null;
  if (change !== null && direction !== 'NEUTRAL' && change !== 0) {
    improved = direction === 'LOWER_IS_BETTER' ? change < 0 : change > 0;
  } else if (change === 0) {
    improved = null; // No movement is not an improvement, and not a regression.
  }

  const display =
    before === null
      ? formatMetricValue(after, pair.unit)
      : `${formatMetricValue(before, pair.unit)} → ${formatMetricValue(after, pair.unit)}`;

  return { ...pair, change, changePercent, improved, display };
}

/**
 * Can these two runs be compared at all?
 *
 * Returns the reason when they cannot, because "why is there no before number
 * on this card" is otherwise a twenty-minute investigation.
 */
export function comparable(
  before: PerfSample,
  after: PerfSample,
): { ok: boolean; reason?: string } {
  if (before.template !== after.template) {
    return { ok: false, reason: `different templates: ${before.template} and ${after.template}` };
  }
  if (before.device !== after.device) {
    return { ok: false, reason: `different devices: ${before.device} and ${after.device}` };
  }
  if (before.measuredAt.getTime() > after.measuredAt.getTime()) {
    return { ok: false, reason: 'the before measurement is newer than the after measurement' };
  }
  return { ok: true };
}

/** The metrics the reference page leads with, in the order it shows them. */
const HEADLINE_METRICS: Array<{
  label: string;
  unit: string | null;
  direction: MetricDirection;
  read: (sample: PerfSample) => number | null | undefined;
}> = [
  {
    label: 'Requests to load the homepage',
    unit: 'requests',
    direction: 'LOWER_IS_BETTER',
    read: (s) => s.requestCount,
  },
  {
    label: 'Third-party hosts on the homepage',
    unit: 'hosts',
    direction: 'LOWER_IS_BETTER',
    read: (s) => s.thirdPartyHosts,
  },
  {
    label: 'MB to load the homepage',
    unit: 'MB',
    direction: 'LOWER_IS_BETTER',
    read: (s) => (s.pageWeightBytes == null ? null : s.pageWeightBytes / BYTES_IN_MB),
  },
  {
    label: 'Largest contentful paint',
    unit: 's',
    direction: 'LOWER_IS_BETTER',
    read: (s) => (s.lcpMs == null ? null : s.lcpMs / 1000),
  },
];

/**
 * Build the card's numbers from two runs of the same template.
 *
 * Only metrics present on BOTH sides are returned. A pair with one side missing
 * would render as "— → 104", which reads like a measurement failure and invites
 * exactly the question the card exists to answer.
 */
export function headlineMetrics(
  before: PerfSample,
  after: PerfSample,
  limit = 3,
): { metrics: MetricDelta[]; skipped?: string } {
  const check = comparable(before, after);
  if (!check.ok) return { metrics: [], skipped: check.reason };

  const metrics: MetricDelta[] = [];
  for (const metric of HEADLINE_METRICS) {
    const beforeValue = metric.read(before);
    const afterValue = metric.read(after);
    if (beforeValue == null || afterValue == null) continue;
    metrics.push(
      describeMetric({
        label: metric.label,
        before: beforeValue,
        after: afterValue,
        unit: metric.unit,
        direction: metric.direction,
      }),
    );
  }

  // Biggest proportional win first: the card has room for three, and the three
  // worth showing are the ones that moved most.
  metrics.sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
  return { metrics: metrics.slice(0, limit) };
}

/**
 * How stale is a number in front of a client?
 *
 * A storefront changes weekly; a figure measured before the last deploy is a
 * claim about a site that no longer exists. Thirty days is the point at which
 * the page should say so rather than quietly keep printing it.
 */
export function metricFreshness(
  measuredAt: Date,
  now: Date = clock.now(),
): { days: number; stale: boolean } {
  const days = Math.floor((now.getTime() - measuredAt.getTime()) / 86_400_000);
  return { days, stale: days > 30 };
}

/**
 * The counts beside the filters on the project index: "6 projects",
 * "106 page comparisons", "124 findings", "Glow-Ups 6", "Design 4".
 *
 * Counted from what is actually visible to the reader, which is the whole point
 * — a client index that counts internal findings in its total is reporting work
 * the client cannot open.
 */
export interface IndexInput {
  projects: ReadonlyArray<{
    engagementType: string | null;
    stage: string;
    publishedAt: Date | null;
    comparisons: number;
    clientVisibleFindings: number;
  }>;
  /** Client view counts only published projects; the agency view counts all. */
  audience: 'client' | 'agency';
}

export function indexSummary(input: IndexInput): {
  projects: number;
  comparisons: number;
  findings: number;
  byEngagement: Record<string, number>;
  byStage: Record<string, number>;
} {
  const visible =
    input.audience === 'client'
      ? input.projects.filter((p) => p.publishedAt !== null)
      : input.projects;

  const byEngagement: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  for (const project of visible) {
    if (project.engagementType)
      byEngagement[project.engagementType] = (byEngagement[project.engagementType] ?? 0) + 1;
    byStage[project.stage] = (byStage[project.stage] ?? 0) + 1;
  }

  return {
    projects: visible.length,
    comparisons: visible.reduce((sum, p) => sum + p.comparisons, 0),
    findings: visible.reduce((sum, p) => sum + p.clientVisibleFindings, 0),
    byEngagement,
    byStage,
  };
}
