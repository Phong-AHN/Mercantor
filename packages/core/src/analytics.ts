/**
 * Calendar-month bucketing for trend charts. Pure and UTC throughout, the
 * same reasoning `format.ts`'s date formatters already follow: every stored
 * timestamp is UTC, so bucketing in UTC is what keeps a project counted in
 * the same month no matter which time zone renders the page.
 */

export interface MonthBucket {
  /** "2026-08" - stable, sortable, safe as a chart key. */
  key: string;
  /** "Aug 2026" - for axis labels. */
  label: string;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The last `count` calendar months, oldest first, ending with the month
 * `now` falls in - so `count: 6` run today always includes this month, even
 * if it has only just started.
 */
export function trailingMonths(count: number, now: Date): MonthBucket[] {
  const months: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    months.push({ key: monthKey(start), label: MONTH_LABEL_FORMAT.format(start), start, end });
  }
  return months;
}

/** Which bucket a date falls into, or `null` when it is outside every one - older than the
 * trailing window, or in the future. */
export function bucketOf(date: Date, months: readonly MonthBucket[]): string | null {
  return months.find((month) => date >= month.start && date < month.end)?.key ?? null;
}
