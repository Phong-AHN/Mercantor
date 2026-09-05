import { DAY_MS, HOUR_MS } from './sla';

const MINUTE_MS = 60_000;

/**
 * Durations are shown the way people say them out loud: "3d 4h", "6h 20m",
 * "just now". Precision beyond two units is noise on a status screen.
 */
export function formatDuration(ms: number, options: { compact?: boolean } = {}): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  if (ms < MINUTE_MS) return options.compact ? '<1m' : 'less than a minute';

  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** "12 days" / "1 day" / "today" - for ages and countdowns. */
export function formatDays(days: number): string {
  const whole = Math.floor(Math.abs(days));
  if (whole === 0) return 'today';
  return `${whole} day${whole === 1 ? '' : 's'}`;
}

export function formatRelative(from: Date, now: Date): string {
  const diff = now.getTime() - from.getTime();
  if (diff < 0) return `in ${formatDuration(-diff, { compact: true })}`;
  if (diff < MINUTE_MS) return 'just now';
  return `${formatDuration(diff, { compact: true })} ago`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATETIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

/** All stored timestamps are UTC; rendering is UTC so two people reading the
 * same screen in two countries see the same string. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const value = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? '-' : DATE_FORMAT.format(value);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const value = typeof date === 'string' ? new Date(date) : date;
  return Number.isNaN(value.getTime()) ? '-' : `${DATETIME_FORMAT.format(value)} UTC`;
}

export function formatMoney(
  amountMinor: number | null | undefined,
  currency = 'USD',
  options: { compact?: boolean } = {},
): string {
  if (amountMinor === null || amountMinor === undefined) return '-';
  const amount = amountMinor / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: options.compact ? 'compact' : 'standard',
    maximumFractionDigits: options.compact ? 1 : 2,
    minimumFractionDigits: options.compact ? 0 : 2,
  }).format(amount);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** `products, variants and 3 more` - for scope and checklist summaries. */
export function formatList(items: readonly string[], max = 2): string {
  if (items.length === 0) return '-';
  if (items.length <= max) {
    if (items.length === 1) return items[0] ?? '-';
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}
