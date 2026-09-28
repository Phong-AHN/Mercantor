/** Recorded on every lightweight run, so it is never compared against a browser-measured one. */
export const PERF_METHOD = 'html-fetch-v1';

export interface PerfRunLike {
  measuredAt: Date;
  ttfbMs: number | null;
  loadMs: number | null;
  requestCount: number | null;
  thirdPartyHosts: number | null;
  error: string | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Is the latest run meaningfully worse than the recent baseline?
 *
 * Compared against the median of up to five earlier successful runs of the
 * same page and device, not the single previous one: one slow response from
 * a busy origin is noise, and flagging it teaches people to ignore the flag.
 */
export function regressionOf(
  latest: PerfRunLike,
  previous: readonly PerfRunLike[],
): { regressed: boolean; reasons: string[] } {
  if (latest.error) return { regressed: false, reasons: [] };
  const baseline = previous.filter((run) => !run.error).slice(0, 5);
  if (baseline.length < 2) return { regressed: false, reasons: [] };

  const reasons: string[] = [];
  const check = (
    label: string,
    value: number | null,
    pick: (run: PerfRunLike) => number | null,
    factor: number,
    floor: number,
    unit: string,
  ) => {
    const base = median(baseline.map(pick).filter((v): v is number => v != null));
    if (value == null || base == null) return;
    if (value > base * factor && value - base >= floor) {
      reasons.push(`${label} ${Math.round(value)}${unit} vs usual ${Math.round(base)}${unit}`);
    }
  };

  check('Server response', latest.ttfbMs, (run) => run.ttfbMs, 1.5, 200, ' ms');
  check('HTML load', latest.loadMs, (run) => run.loadMs, 1.5, 300, ' ms');
  check('Resources', latest.requestCount, (run) => run.requestCount, 1.2, 5, '');
  check('Third-party hosts', latest.thirdPartyHosts, (run) => run.thirdPartyHosts, 1.2, 2, '');

  return { regressed: reasons.length > 0, reasons };
}
