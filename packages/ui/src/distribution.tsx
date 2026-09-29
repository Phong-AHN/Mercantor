import * as React from 'react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_BAR, TONE_DOT, TONE_STROKE } from './tone';

/**
 * Charts for magnitude, part-to-whole and progress. Same rules as chart.tsx:
 * thin marks, a 2px gap between touching marks rather than a border, values
 * in text tokens beside the marks (never in the mark colour), and every value
 * readable without hover - the native `title` only adds detail.
 */

// ─── Horizontal bars ────────────────────────────────────────────────────────

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Draws a thin tick at this value, e.g. a stage's target dwell time. */
  target?: number | null;
  /** Mark tone. Defaults to the accent; use a status tone only when the colour means status. */
  tone?: Tone;
  /** Shown at the bar tip. Defaults to `format(value)`. */
  display?: string;
  /** Makes the whole row a link, e.g. to the list filtered to this row. */
  href?: string;
  /** Muted secondary text after the label, e.g. "60+ days". */
  hint?: string;
}

/**
 * Magnitude across a handful of named rows: one series, one hue, the value at
 * the tip, and an optional target tick. Bars stay thin (8px) and grow from
 * one baseline.
 */
export function BarList({
  items,
  format = (value) => String(value),
  max: maxProp,
  linkAs: LinkComponent = 'a',
  labelWidth = '8.5rem',
  className,
}: {
  items: readonly BarListItem[];
  format?: (value: number) => string;
  max?: number;
  linkAs?: React.ElementType;
  labelWidth?: string;
  className?: string;
}) {
  const max = Math.max(
    1,
    maxProp ?? 0,
    ...items.map((item) => Math.max(item.value, item.target ?? 0)),
  );
  return (
    <ul className={cn(items.some((item) => item.href) ? 'space-y-0.5' : 'space-y-2.5', className)}>
      {items.map((item) => {
        const pct = (item.value / max) * 100;
        const targetPct = item.target != null ? (item.target / max) * 100 : null;
        const text = item.display ?? format(item.value);
        const Row: React.ElementType = item.href ? LinkComponent : 'div';
        return (
          <li key={item.key}>
            <Row
              {...(item.href ? { href: item.href } : {})}
              className={cn(
                'grid items-center gap-3',
                item.href &&
                  'hover:bg-surface-2 focus-visible:ring-accent -mx-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2',
              )}
              style={{ gridTemplateColumns: `minmax(0,${labelWidth}) minmax(0,1fr)` }}
            >
              <span className="text-ink-soft truncate text-[13px]" title={item.label}>
                {item.label}
                {item.hint && <span className="text-muted ml-1.5 text-[12px]">{item.hint}</span>}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="relative h-2 min-w-0 flex-1"
                  title={`${item.label}: ${text}${item.target != null ? ` (target ${format(item.target)})` : ''}`}
                >
                  <span className="bg-surface-3 absolute inset-0 rounded-full" aria-hidden />
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
                      item.value > 0 && 'min-w-1',
                      TONE_BAR[item.tone ?? 'accent'],
                    )}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  {targetPct !== null && (
                    <span
                      className="bg-ink-soft absolute -inset-y-1 w-px"
                      style={{ left: `${targetPct}%` }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="text-ink-soft w-16 shrink-0 text-right text-[12px] tabular-nums">
                  {text}
                </span>
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Part to whole ──────────────────────────────────────────────────────────

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** Status tones only when the colour means status. */
  tone: Tone;
  /** Makes the legend row a link, e.g. to the list filtered to this segment. */
  href?: string;
}

/**
 * Part-to-whole for a few categories (six at most). The total sits in the
 * middle and every segment is listed with its count, so no value depends on
 * colour or hover alone.
 */
export function DonutChart({
  segments,
  total: totalLabel,
  caption,
  size = 120,
  linkAs: LinkComponent = 'a',
  className,
}: {
  segments: readonly DonutSegment[];
  /** Text in the middle; defaults to the sum. */
  total?: string;
  /** Read out before the values. */
  caption?: string;
  size?: number;
  linkAs?: React.ElementType;
  className?: string;
}) {
  const sum = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const visible = segments.filter((segment) => segment.value > 0);
  // A 2px gap between arcs, converted into the 100-unit viewBox.
  const gap = visible.length > 1 ? (2 / size) * 100 : 0;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={`${caption ? `${caption}: ` : ''}${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
          className="-rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="10"
            className="stroke-surface-3"
          />
          {sum > 0 &&
            visible.map((segment) => {
              const length = (segment.value / sum) * circumference;
              const dash = Math.max(0.5, length - gap);
              const arc = (
                <circle
                  key={segment.key}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  strokeWidth="10"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  className={TONE_STROKE[segment.tone]}
                >
                  <title>{`${segment.label}: ${segment.value}`}</title>
                </circle>
              );
              offset += length;
              return arc;
            })}
        </svg>
        <span
          className="text-ink absolute inset-0 grid place-items-center text-[22px] font-semibold"
          aria-hidden
        >
          {totalLabel ?? sum}
        </span>
      </div>
      <ul className="min-w-[9rem] flex-1 space-y-0.5">
        {segments.map((segment) => {
          const Row: React.ElementType = segment.href ? LinkComponent : 'div';
          return (
            <li key={segment.key}>
              <Row
                {...(segment.href ? { href: segment.href } : {})}
                className={cn(
                  'flex items-center gap-2 py-1 text-[13px]',
                  segment.href &&
                    'hover:bg-surface-2 focus-visible:ring-accent -mx-2 rounded-[var(--radius-sm)] px-2 transition-colors focus-visible:outline-none focus-visible:ring-2',
                )}
              >
                <span
                  className={cn('size-2.5 shrink-0 rounded-full', TONE_DOT[segment.tone])}
                  aria-hidden
                />
                <span className="text-ink-soft">{segment.label}</span>
                <span className="text-ink ml-auto pl-3 font-semibold tabular-nums">
                  {segment.value}
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Stage progress ─────────────────────────────────────────────────────────

export interface StageProgressStep {
  key: string;
  label: string;
  phase: string;
  state: 'done' | 'current' | 'upcoming';
}

/**
 * Where a project is on its track, as one segmented bar: finished steps
 * filled, the current one ringed, the rest a track, with the first and last
 * step named at the ends. Not grouped by phase - the real track moves between
 * build and review more than once, so phase groups would repeat. Each step's
 * phase is in its hover label. Built for the project hero, so it reads on a
 * photo (`onImage`) as well as a surface.
 */
export function StageProgress({
  steps,
  onImage = false,
  className,
}: {
  steps: readonly StageProgressStep[];
  onImage?: boolean;
  className?: string;
}) {
  const current = steps.findIndex((step) => step.state === 'current');
  const done = steps.filter((step) => step.state === 'done').length;

  return (
    <div
      className={className}
      role="img"
      aria-label={
        current >= 0
          ? `Step ${current + 1} of ${steps.length}: ${steps[current]!.label}. ${done} finished.`
          : `${done} of ${steps.length} steps finished.`
      }
    >
      <div className="flex gap-0.5">
        {steps.map((step) => (
          <span
            key={step.key}
            title={`${step.label} · ${step.phase}`}
            className={cn(
              'h-1.5 min-w-0 flex-1 rounded-full',
              step.state === 'done' && (onImage ? 'bg-white/85' : 'bg-accent'),
              step.state === 'current' &&
                (onImage ? 'bg-white ring-2 ring-white/45' : 'bg-accent ring-accent/35 ring-2'),
              step.state === 'upcoming' && (onImage ? 'bg-white/25' : 'bg-surface-3'),
            )}
          />
        ))}
      </div>
      {steps.length > 1 && (
        <p
          className={cn(
            'mt-1.5 flex justify-between gap-3 text-[11px] font-medium',
            onImage ? 'text-white/80' : 'text-muted',
          )}
          aria-hidden
        >
          <span className="truncate">{steps[0]!.label}</span>
          <span className="truncate">{steps[steps.length - 1]!.label}</span>
        </p>
      )}
    </div>
  );
}
