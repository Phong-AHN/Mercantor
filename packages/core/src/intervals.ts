/** Half-open interval `[start, end)` in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

export function makeInterval(start: Date, end: Date | null, fallbackEnd: Date): Interval {
  return { start: start.getTime(), end: (end ?? fallbackEnd).getTime() };
}

export function clampInterval(interval: Interval, bounds: Interval): Interval | null {
  const start = Math.max(interval.start, bounds.start);
  const end = Math.min(interval.end, bounds.end);
  return end > start ? { start, end } : null;
}

export function intervalLength(interval: Interval): number {
  return Math.max(0, interval.end - interval.start);
}

export function totalLength(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, i) => sum + intervalLength(i), 0);
}

/** Merges overlapping and touching intervals into a normalised, sorted set. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * `base` minus everything in `holes`. Used to stop one millisecond being
 * charged to two different teams: blocker time is claimed first, and the stage
 * owner is charged only for what is left.
 */
export function subtractIntervals(base: Interval, holes: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  let cursor = base.start;
  for (const hole of mergeIntervals(holes)) {
    if (hole.end <= cursor) continue;
    if (hole.start >= base.end) break;
    if (hole.start > cursor) {
      result.push({ start: cursor, end: Math.min(hole.start, base.end) });
    }
    cursor = Math.max(cursor, hole.end);
    if (cursor >= base.end) break;
  }
  if (cursor < base.end) result.push({ start: cursor, end: base.end });
  return result;
}
