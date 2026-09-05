import {
  MIGRATION_TYPES,
  PROJECT_HEALTHS,
  PROJECT_STAGES,
  TEAMS,
  type MigrationType,
  type ProjectHealth,
  type ProjectStage,
  type Team,
} from '@relay/core';
import type { ProjectFilters } from './queries';

/**
 * Filters live in the URL, so a filtered view is a link somebody can paste into
 * Slack and everyone opens the same thing. Unknown values are dropped rather
 * than passed through to Prisma.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : value.split(',')).map((v) => v.trim()).filter(Boolean);
}

function only<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

const SORTS = ['recent', 'oldest', 'age', 'launch', 'merchant', 'stage'] as const;
const LAUNCHES = ['overdue', 'soon', 'none'] as const;

export function parseFilters(params: SearchParams): ProjectFilters {
  const q = typeof params.q === 'string' ? params.q.trim() : undefined;
  const sortRaw = typeof params.sort === 'string' ? params.sort : undefined;
  const launchRaw = typeof params.launch === 'string' ? params.launch : undefined;
  const blockerOwnerRaw = typeof params.blockerOwner === 'string' ? params.blockerOwner : undefined;

  return {
    q: q || undefined,
    stage: only<ProjectStage>(list(params.stage), PROJECT_STAGES),
    health: only<ProjectHealth>(list(params.health), PROJECT_HEALTHS),
    migrationType: only<MigrationType>(list(params.type), MIGRATION_TYPES),
    ahnPmId: typeof params.pm === 'string' ? params.pm : undefined,
    ahnDevId: typeof params.dev === 'string' ? params.dev : undefined,
    shoplineAmId: typeof params.am === 'string' ? params.am : undefined,
    blockerOwner:
      blockerOwnerRaw && (TEAMS as readonly string[]).includes(blockerOwnerRaw)
        ? (blockerOwnerRaw as Team)
        : undefined,
    launch:
      launchRaw && (LAUNCHES as readonly string[]).includes(launchRaw)
        ? (launchRaw as (typeof LAUNCHES)[number])
        : undefined,
    includeCompleted: params.completed === '1',
    sort:
      sortRaw && (SORTS as readonly string[]).includes(sortRaw)
        ? (sortRaw as (typeof SORTS)[number])
        : 'recent',
  };
}

/** Rebuilds a query string with one key changed - used by the filter chips. */
export function withParam(params: SearchParams, key: string, value: string | undefined): string {
  const next = new URLSearchParams();
  for (const [name, raw] of Object.entries(params)) {
    if (name === key || raw === undefined) continue;
    for (const item of Array.isArray(raw) ? raw : [raw]) next.append(name, item);
  }
  if (value !== undefined && value !== '') next.set(key, value);
  const query = next.toString();
  return query ? `?${query}` : '';
}

export function activeFilterCount(filters: ProjectFilters): number {
  return [
    filters.q,
    filters.stage?.length,
    filters.health?.length,
    filters.migrationType?.length,
    filters.ahnPmId,
    filters.ahnDevId,
    filters.shoplineAmId,
    filters.blockerOwner,
    filters.launch,
  ].filter(Boolean).length;
}
