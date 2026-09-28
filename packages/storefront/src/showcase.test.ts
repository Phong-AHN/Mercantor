import { describe, expect, it } from 'vitest';
import {
  comparable,
  describeMetric,
  headlineMetrics,
  indexSummary,
  metricFreshness,
  type PerfSample,
} from './showcase';

/**
 * The numbers on a project card are shown to the merchant who paid for the
 * work. Each test here is a way of printing one that is not true.
 */

const sample = (overrides: Partial<PerfSample> = {}): PerfSample => ({
  id: 'test-1',
  template: 'HOME',
  device: 'MOBILE',
  measuredAt: new Date('2026-06-01T00:00:00Z'),
  requestCount: 375,
  thirdPartyHosts: 35,
  pageWeightBytes: 10.2 * 1024 * 1024,
  lcpMs: 4200,
  ...overrides,
});

describe('a before and after, as the card prints it', () => {
  it('reads the way the reference page reads', () => {
    const metric = describeMetric({
      label: 'Requests to load the homepage',
      before: 375,
      after: 104,
      unit: 'requests',
      direction: 'LOWER_IS_BETTER',
    });
    expect(metric.display).toBe('375 → 104');
    expect(metric.change).toBe(-271);
    expect(metric.changePercent).toBe(-72);
    expect(metric.improved).toBe(true);
  });

  it('keeps one decimal for megabytes and none for counts', () => {
    expect(
      describeMetric({
        label: 'MB',
        before: 10.24,
        after: 1.93,
        unit: 'MB',
        direction: 'LOWER_IS_BETTER',
      }).display,
    ).toBe('10.2 MB → 1.9 MB');
    expect(
      describeMetric({
        label: 'Requests',
        before: 374.6,
        after: 104.4,
        unit: 'requests',
        direction: 'LOWER_IS_BETTER',
      }).display,
    ).toBe('375 → 104');
  });

  it('knows that more is better for some things', () => {
    const pages = describeMetric({
      label: 'Content pages',
      before: 3,
      after: 8,
      unit: 'pages',
      direction: 'HIGHER_IS_BETTER',
    });
    expect(pages.improved).toBe(true);
    const requests = describeMetric({
      label: 'Requests',
      before: 3,
      after: 8,
      unit: 'requests',
      direction: 'LOWER_IS_BETTER',
    });
    expect(requests.improved).toBe(false);
  });

  it('shows a single number rather than an empty comparison', () => {
    const metric = describeMetric({
      label: 'Requests',
      before: null,
      after: 104,
      unit: 'requests',
      direction: 'LOWER_IS_BETTER',
    });
    expect(metric.display).toBe('104');
    expect(metric.improved).toBeNull();
  });

  it('calls no movement neither a win nor a regression', () => {
    expect(
      describeMetric({
        label: 'Requests',
        before: 20,
        after: 20,
        unit: null,
        direction: 'LOWER_IS_BETTER',
      }).improved,
    ).toBeNull();
  });

  it('does not divide by a before of zero', () => {
    expect(
      describeMetric({
        label: 'Pop-ups',
        before: 0,
        after: 0,
        unit: null,
        direction: 'LOWER_IS_BETTER',
      }).changePercent,
    ).toBeNull();
  });
});

describe('two runs are only comparable when they measured the same thing', () => {
  it('refuses a mobile run against a desktop one, and says so', () => {
    const check = comparable(sample(), sample({ device: 'DESKTOP' }));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('different devices');
  });

  it('refuses a product page against a homepage', () => {
    expect(comparable(sample(), sample({ template: 'PRODUCT' })).reason).toContain(
      'different templates',
    );
  });

  it('refuses a before that was measured after the after', () => {
    const check = comparable(sample({ measuredAt: new Date('2026-08-01T00:00:00Z') }), sample());
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('newer');
  });

  it('accepts two runs of the same template on the same device', () => {
    expect(comparable(sample(), sample({ measuredAt: new Date('2026-08-01T00:00:00Z') })).ok).toBe(
      true,
    );
  });
});

describe('the three numbers on the card', () => {
  const before = sample();
  const after = sample({
    id: 'test-2',
    measuredAt: new Date('2026-08-01T00:00:00Z'),
    requestCount: 104,
    thirdPartyHosts: 3,
    pageWeightBytes: 1.9 * 1024 * 1024,
    lcpMs: 2100,
  });

  it('leads with the metrics that moved most', () => {
    const { metrics } = headlineMetrics(before, after);
    expect(metrics).toHaveLength(3);
    expect(metrics[0]?.label).toBe('Third-party hosts on the homepage'); // −91%
    expect(metrics.map((m) => m.improved)).toEqual([true, true, true]);
  });

  it('drops a metric measured on only one side rather than printing a dash', () => {
    const { metrics } = headlineMetrics(before, sample({ ...after, thirdPartyHosts: null }));
    expect(metrics.map((m) => m.label)).not.toContain('Third-party hosts on the homepage');
    expect(metrics.every((m) => m.before !== null && m.after !== null)).toBe(true);
  });

  it('returns nothing, with a reason, when the runs cannot be compared', () => {
    const result = headlineMetrics(before, sample({ device: 'DESKTOP' }));
    expect(result.metrics).toEqual([]);
    expect(result.skipped).toContain('different devices');
  });
});

describe('how old the numbers are', () => {
  it('marks a figure from before the last month as stale', () => {
    const now = new Date('2026-09-23T00:00:00Z');
    expect(metricFreshness(new Date('2026-09-20T00:00:00Z'), now)).toEqual({
      days: 3,
      stale: false,
    });
    expect(metricFreshness(new Date('2026-06-01T00:00:00Z'), now).stale).toBe(true);
  });
});

describe('the counts beside the filters', () => {
  const published = new Date('2026-09-01T00:00:00Z');
  const projects = [
    {
      engagementType: 'GLOW_UP',
      stage: 'DESIGN',
      publishedAt: published,
      comparisons: 20,
      clientVisibleFindings: 19,
    },
    {
      engagementType: 'GLOW_UP',
      stage: 'BUILD',
      publishedAt: published,
      comparisons: 18,
      clientVisibleFindings: 21,
    },
    {
      engagementType: 'PLATFORM_MIGRATION',
      stage: 'LIVE',
      publishedAt: null,
      comparisons: 9,
      clientVisibleFindings: 4,
    },
  ];

  it('counts only published projects for the client', () => {
    const summary = indexSummary({ projects, audience: 'client' });
    expect(summary).toMatchObject({ projects: 2, comparisons: 38, findings: 40 });
    expect(summary.byEngagement).toEqual({ GLOW_UP: 2 });
  });

  it('counts everything for the agency', () => {
    const summary = indexSummary({ projects, audience: 'agency' });
    expect(summary.projects).toBe(3);
    expect(summary.byStage).toEqual({ DESIGN: 1, BUILD: 1, LIVE: 1 });
  });
});
