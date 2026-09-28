import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type FindingCategory,
  type FindingSeverity,
  type FindingStatus,
} from '@relay/core';
import type { FindingFilters } from './queries';

export type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return text?.trim() || undefined;
}

function date(raw: string | undefined, endOfDay = false): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const value = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

/** URL search params to list filters. Anything unrecognised is ignored, never an error. */
export function parseFindingFilters(
  params: SearchParams,
  selfId: string,
): { filters: FindingFilters; raw: Record<string, string> } {
  const raw: Record<string, string> = {};
  for (const key of ['q', 'category', 'severity', 'status', 'assignee', 'from', 'to', 'visible', 'project']) {
    const value = one(params, key);
    if (value) raw[key] = value;
  }

  const status = raw.status;
  const filters: FindingFilters = {
    q: raw.q?.slice(0, 200),
    category: FINDING_CATEGORIES.includes(raw.category as FindingCategory)
      ? (raw.category as FindingCategory)
      : undefined,
    severity: FINDING_SEVERITIES.includes(raw.severity as FindingSeverity)
      ? (raw.severity as FindingSeverity)
      : undefined,
    status:
      status === 'all'
        ? 'all'
        : FINDING_STATUSES.includes(status as FindingStatus)
          ? (status as FindingStatus)
          : 'open',
    assigneeId:
      raw.assignee === 'me'
        ? selfId
        : raw.assignee && /^[0-9a-f-]{36}$/i.test(raw.assignee)
          ? raw.assignee
          : undefined,
    from: date(raw.from),
    to: date(raw.to, true),
    clientVisible: raw.visible === 'shared' ? true : raw.visible === 'internal' ? false : undefined,
    projectCode: raw.project,
  };
  return { filters, raw };
}

export function hrefWith(base: string, raw: Record<string, string>, change: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...raw, ...change })) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `${base}?${query}` : base;
}
