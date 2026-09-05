import * as React from 'react';
import { TEAM_LABEL, type Team, type Tone } from '@relay/core';
import { cn } from './cn';
import { TEAM_BAR, TONE_BAR } from './tone';

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  size = 'md',
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className={cn(
        'bg-surface-3 w-full overflow-hidden rounded-full',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONE_BAR[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export interface Segment {
  key: string;
  value: number;
  label: string;
  className: string;
}

/**
 * The delay-ownership bar. One row, four colours, and the argument about who
 * held the project up is settled by looking at it.
 */
export function SegmentedBar({
  segments,
  height = 'md',
  showLegend = true,
  className,
}: {
  segments: readonly Segment[];
  height?: 'sm' | 'md' | 'lg';
  showLegend?: boolean;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  return (
    <div className={className}>
      <div
        className={cn(
          'bg-surface-3 flex w-full overflow-hidden rounded-full',
          height === 'sm' ? 'h-1.5' : height === 'lg' ? 'h-3' : 'h-2',
        )}
      >
        {total > 0 &&
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <div
                key={segment.key}
                className={cn('h-full transition-[width] duration-500', segment.className)}
                style={{ width: `${(segment.value / total) * 100}%` }}
                title={`${segment.label}: ${Math.round((segment.value / total) * 100)}%`}
              />
            ))}
      </div>
      {showLegend && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((segment) => (
            <li key={segment.key} className="text-muted flex items-center gap-1.5 text-[12px]">
              <span className={cn('size-2 rounded-full', segment.className)} />
              <span className="text-ink-soft">{segment.label}</span>
              <span className="tabular text-faint">
                {total > 0 ? Math.round((segment.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Convenience wrapper: a team split needs the same colours every time. */
export function TeamSplitBar({
  byTeam,
  format,
  height = 'md',
  showLegend = true,
  className,
}: {
  byTeam: Record<Team, number>;
  format?: (ms: number) => string;
  height?: 'sm' | 'md' | 'lg';
  showLegend?: boolean;
  className?: string;
}) {
  const segments: Segment[] = (['AHN', 'MERCHANT', 'SHOPLINE', 'OTHER'] as const).map((team) => ({
    key: team,
    value: byTeam[team],
    label: format ? `${TEAM_LABEL[team].label} ${format(byTeam[team])}` : TEAM_LABEL[team].label,
    className: TEAM_BAR[team],
  }));
  return (
    <SegmentedBar
      segments={segments}
      height={height}
      showLegend={showLegend}
      className={className}
    />
  );
}

/**
 * A dwell-time meter: how long a stage has run against its target. Going over
 * turns the bar, not just the label, so it reads at a glance.
 */
export function TargetMeter({
  value,
  target,
  format,
  className,
}: {
  value: number;
  target: number | null;
  format: (ms: number) => string;
  className?: string;
}) {
  if (target === null) {
    return (
      <div className={cn('text-muted text-[12.5px]', className)}>
        {format(value)} <span className="text-faint">- no target</span>
      </div>
    );
  }
  const ratio = value / target;
  const over = ratio > 1;
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className={cn('tabular font-medium', over ? 'text-danger-ink' : 'text-ink')}>
          {format(value)}
        </span>
        <span className="tabular text-faint">target {format(target)}</span>
      </div>
      <div className="bg-surface-3 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            over ? 'bg-danger' : 'bg-success',
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
