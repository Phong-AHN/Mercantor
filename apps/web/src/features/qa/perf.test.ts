import { describe, expect, it } from 'vitest';
import { regressionOf, type PerfRunLike } from './perf';

const run = (over: Partial<PerfRunLike>): PerfRunLike => ({
  measuredAt: new Date('2026-09-01T00:00:00Z'),
  ttfbMs: 300,
  loadMs: 600,
  requestCount: 80,
  thirdPartyHosts: 10,
  error: null,
  ...over,
});

describe('regressionOf', () => {
  it('needs at least two earlier runs', () => {
    expect(regressionOf(run({ ttfbMs: 5000 }), [run({})]).regressed).toBe(false);
  });

  it('flags a clear slowdown against the median', () => {
    const result = regressionOf(run({ ttfbMs: 900 }), [run({}), run({}), run({ ttfbMs: 2000 })]);
    expect(result.regressed).toBe(true);
    expect(result.reasons[0]).toContain('Server response');
  });

  it('ignores small absolute changes', () => {
    expect(regressionOf(run({ ttfbMs: 40 }), [run({ ttfbMs: 20 }), run({ ttfbMs: 20 })]).regressed).toBe(false);
  });

  it('ignores failed runs on both sides', () => {
    expect(regressionOf(run({ error: 'x' }), [run({}), run({})]).regressed).toBe(false);
    expect(regressionOf(run({ ttfbMs: 900 }), [run({ error: 'x' }), run({})]).regressed).toBe(false);
  });
});
