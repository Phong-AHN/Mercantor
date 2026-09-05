'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Download, LayoutGrid, RotateCcw, Rows3, Search } from 'lucide-react';
import {
  HEALTH_LABEL,
  MIGRATION_TYPE_LABEL,
  MIGRATION_TYPES,
  PROJECT_HEALTHS,
  STAGES,
  LINEAR_STAGES,
  TEAM_LABEL,
  TEAMS,
} from '@relay/core';
import { cn, Select } from '@relay/ui';

export interface FilterOption {
  id: string;
  name: string;
}

/**
 * Every control writes to the URL rather than to local state. That makes a
 * filtered board a shareable link and keeps the server the only place that
 * decides what the list contains.
 */
export function FiltersBar({
  people,
  view,
  total,
}: {
  people: { ahn: FilterOption[]; shopline: FilterOption[] };
  view: 'table' | 'board';
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    startTransition(() => router.push(`/projects?${next.toString()}`));
  };

  const toggleIn = (key: string, value: string) => {
    const current = params.getAll(key);
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    const updated = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    for (const item of updated) next.append(key, item);
    startTransition(() => router.push(`/projects?${next.toString()}`));
  };

  const active = params.toString().length > 0;

  return (
    <div className={cn('space-y-3', pending && 'opacity-70 transition-opacity')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[15rem] flex-1">
          <Search className="text-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="search"
            defaultValue={params.get('q') ?? ''}
            placeholder="Merchant, project code or store ID"
            aria-label="Filter projects"
            onKeyDown={(event) => {
              if (event.key === 'Enter') set('q', (event.target as HTMLInputElement).value);
            }}
            onBlur={(event) => {
              if (event.target.value !== (params.get('q') ?? '')) set('q', event.target.value);
            }}
            className="border-line bg-surface-1 text-ink placeholder:text-faint focus:border-accent focus:ring-accent/20 h-9 w-full rounded-[var(--radius-md)] border pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2"
          />
        </div>

        <Select
          aria-label="Stage"
          value={params.get('stage') ?? ''}
          onChange={(event) => set('stage', event.target.value || null)}
          className="w-auto min-w-[10rem]"
        >
          <option value="">All stages</option>
          {LINEAR_STAGES.concat('ON_HOLD_BLOCKED').map((stage) => (
            <option key={stage} value={stage}>
              {STAGES[stage].label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Migration type"
          value={params.get('type') ?? ''}
          onChange={(event) => set('type', event.target.value || null)}
          className="w-auto min-w-[9rem]"
        >
          <option value="">All types</option>
          {MIGRATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {MIGRATION_TYPE_LABEL[type].label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="AHN project manager"
          value={params.get('pm') ?? ''}
          onChange={(event) => set('pm', event.target.value || null)}
          className="w-auto min-w-[10rem]"
        >
          <option value="">Any AHN PM</option>
          {people.ahn.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="SHOPLINE account manager"
          value={params.get('am') ?? ''}
          onChange={(event) => set('am', event.target.value || null)}
          className="w-auto min-w-[11rem]"
        >
          <option value="">Any SHOPLINE AM</option>
          {people.shopline.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Blocker owner"
          value={params.get('blockerOwner') ?? ''}
          onChange={(event) => set('blockerOwner', event.target.value || null)}
          className="w-auto min-w-[10rem]"
        >
          <option value="">Any blocker owner</option>
          {TEAMS.map((team) => (
            <option key={team} value={team}>
              Blocked on {TEAM_LABEL[team].label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Launch window"
          value={params.get('launch') ?? ''}
          onChange={(event) => set('launch', event.target.value || null)}
          className="w-auto min-w-[10rem]"
        >
          <option value="">Any launch date</option>
          <option value="overdue">Past target launch</option>
          <option value="soon">Launching in 14 days</option>
          <option value="none">No target date</option>
        </Select>

        <Select
          aria-label="Sort"
          value={params.get('sort') ?? 'recent'}
          onChange={(event) => set('sort', event.target.value)}
          className="w-auto min-w-[9.5rem]"
        >
          <option value="recent">Recently active</option>
          <option value="oldest">Least recently active</option>
          <option value="age">Oldest project</option>
          <option value="launch">Target launch</option>
          <option value="merchant">Merchant name</option>
          <option value="stage">Stage</option>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={`/api/projects/export${params.toString() ? `?${params.toString()}` : ''}`}
            className="border-line bg-surface-1 text-muted hover:text-ink hover:border-line-strong inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
          >
            <Download className="size-3.5" />
            Export CSV
          </a>

          <div className="border-line bg-surface-1 flex items-center rounded-[var(--radius-md)] border p-0.5">
            {(
              [
                ['table', Rows3, 'Table'],
                ['board', LayoutGrid, 'Board'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => set('view', value === 'table' ? null : value)}
                aria-pressed={view === value}
                title={`${label} view`}
                className={cn(
                  'flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                  view === value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink-soft',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {active && (
            <button
              type="button"
              onClick={() => startTransition(() => router.push('/projects'))}
              className="text-muted hover:bg-surface-2 hover:text-ink inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Health is the one filter people reach for constantly, so it gets
          chips rather than another dropdown. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-faint text-[12px]">Health</span>
        {PROJECT_HEALTHS.map((health) => {
          const on = params.getAll('health').includes(health);
          return (
            <button
              key={health}
              type="button"
              onClick={() => toggleIn('health', health)}
              aria-pressed={on}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                on
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line bg-surface-1 text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {HEALTH_LABEL[health].label}
            </button>
          );
        })}

        <span className="text-faint ml-2 text-[12px]">Include</span>
        <button
          type="button"
          onClick={() => set('completed', params.get('completed') === '1' ? null : '1')}
          aria-pressed={params.get('completed') === '1'}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
            params.get('completed') === '1'
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line bg-surface-1 text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          Completed projects
        </button>

        <span className="tabular text-muted ml-auto text-[12.5px]">
          {total} {total === 1 ? 'project' : 'projects'}
        </span>
      </div>
    </div>
  );
}
