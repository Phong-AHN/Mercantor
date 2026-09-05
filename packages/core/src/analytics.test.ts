import { describe, expect, it } from 'vitest';
import { bucketOf, monthKey, trailingMonths } from './analytics';

describe('trailingMonths', () => {
  it('returns the requested count, oldest first, ending with the month "now" falls in', () => {
    const months = trailingMonths(3, new Date('2026-09-15T12:00:00.000Z'));
    expect(months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('crosses a year boundary correctly', () => {
    const months = trailingMonths(3, new Date('2027-01-05T00:00:00.000Z'));
    expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('labels each bucket as a short month and year', () => {
    const months = trailingMonths(1, new Date('2026-08-20T00:00:00.000Z'));
    expect(months[0]?.label).toBe('Aug 2026');
  });

  it('each bucket spans the whole calendar month, in UTC', () => {
    const [month] = trailingMonths(1, new Date('2026-08-20T00:00:00.000Z'));
    expect(month!.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(month!.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('monthKey', () => {
  it('pads a single-digit month', () => {
    expect(monthKey(new Date('2026-03-15T00:00:00.000Z'))).toBe('2026-03');
  });
});

describe('bucketOf', () => {
  const months = trailingMonths(3, new Date('2026-09-15T00:00:00.000Z'));

  it('finds the bucket a date falls into', () => {
    expect(bucketOf(new Date('2026-08-10T00:00:00.000Z'), months)).toBe('2026-08');
  });

  it('treats the end of a bucket as exclusive - the first instant of the next month is not in it', () => {
    expect(bucketOf(new Date('2026-09-01T00:00:00.000Z'), months)).toBe('2026-09');
  });

  it('returns null for a date older than the trailing window', () => {
    expect(bucketOf(new Date('2026-01-01T00:00:00.000Z'), months)).toBeNull();
  });

  it('returns null for a date in the future', () => {
    expect(bucketOf(new Date('2027-01-01T00:00:00.000Z'), months)).toBeNull();
  });
});
