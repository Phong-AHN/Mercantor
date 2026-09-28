import * as React from 'react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_DOT, TONE_SOFT, TONE_SOLID, TONE_TEXT } from './tone';

/**
 * The project-showcase surface: what a merchant sees when the agency shows the
 * work, and what the team sees when reviewing it internally.
 *
 * Modelled on the live reference at shopline.powercommerce.com/projects, where
 * a project card leads with three measured numbers as before → after pairs.
 * The design rule the rest of this package follows applies here too: no
 * component writes a colour, and nothing re-decides what "improved" looks like.
 */

// ─── One measured number, before and after ──────────────────────────────────

export interface MetricDeltaProps {
  label: string;
  /** Struck through, small. Omit when there is nothing to compare against. */
  before?: string | null;
  after: string;
  /**
   * Whether the movement is good. Decided by the metric, not by the sign:
   * fewer requests is a win, fewer content pages is not.
   */
  improved?: boolean | null;
  /**
   * Set when the measurement is older than the work it describes. The card
   * says so rather than quietly presenting a stale figure as current.
   */
  staleDays?: number | null;
  className?: string;
}

/**
 * The card's headline figure.
 *
 * The before value is deliberately small and struck through: it is context for
 * the after value, not a second number competing with it. Reversing that
 * emphasis is the quickest way to make a card about improvement read as a card
 * about history.
 */
export function MetricDelta({
  label,
  before,
  after,
  improved,
  staleDays,
  className,
}: MetricDeltaProps) {
  const tone: Tone = improved === true ? 'success' : improved === false ? 'danger' : 'muted';

  return (
    <div className={cn('min-w-0', className)}>
      <p className="flex items-baseline gap-1.5">
        {before != null && (
          <span
            className={cn('text-[13px] font-medium tabular-nums line-through', TONE_TEXT[tone])}
            aria-label={`was ${before}`}
          >
            {before}
          </span>
        )}
        <span className="text-ink text-[26px] font-semibold tabular-nums leading-none tracking-tight">
          {after}
        </span>
      </p>
      <p className="text-muted mt-1.5 text-[12.5px] leading-tight">{label}</p>
      {staleDays != null && staleDays > 30 && (
        <p className="text-warning-ink mt-1 text-[11px]">measured {staleDays} days ago</p>
      )}
    </div>
  );
}

/** The row of three. More than three and none of them is a headline. */
export function MetricRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3', className)}>
      {children}
    </div>
  );
}

// ─── Chips ──────────────────────────────────────────────────────────────────

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The engagement kind, printed solid — one per card, and it leads the row. */
  emphasis?: 'primary' | 'outline';
  tone?: Tone;
  /** A leading status dot, for the stage chip. */
  dot?: boolean;
}

export function Chip({
  emphasis = 'outline',
  tone = 'neutral',
  dot,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium',
        emphasis === 'primary'
          ? TONE_SOLID.neutral
          : dot
            ? TONE_SOFT[tone]
            : 'border-line text-ink border bg-transparent',
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

// ─── The stack line ─────────────────────────────────────────────────────────

export interface StackLineProps {
  /** "Shopify (Dawn)" — platform and theme, as one phrase. */
  from: string;
  /** The apps found on it. Shown up to `visible`, then counted. */
  apps?: readonly string[];
  /** "Shopline" — where it is going. */
  to: string;
  visible?: number;
  className?: string;
}

/**
 * Where the storefront is moving from and to, with the apps that have to come
 * with it.
 *
 * The app list is the part that decides how hard a migration is, so it is on
 * the card rather than behind a tab — but truncated, because a store with
 * twenty apps would otherwise push the numbers off the card.
 */
export function StackLine({ from, apps = [], to, visible = 5, className }: StackLineProps) {
  const shown = apps.slice(0, visible);
  const hidden = apps.length - shown.length;

  return (
    <p className={cn('text-ink text-[13.5px] leading-relaxed', className)}>
      <span className="font-medium">{from}</span>
      {shown.length > 0 && <span className="text-muted"> + {shown.join(', ')}</span>}
      {hidden > 0 && <span className="text-muted"> … +{hidden} more</span>}
      <span className="text-muted mx-2" aria-hidden>
        →
      </span>
      <span className="font-medium">{to}</span>
    </p>
  );
}

// ─── Filters with counts ────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface FilterChipsProps {
  legend: string;
  options: readonly FilterOption[];
  active: string;
  /** Rendered as links so a filtered view is a URL somebody can send. */
  hrefFor: (value: string) => string;
  className?: string;
}

/**
 * The filter row, with counts.
 *
 * Counts are shown even when zero: "2.0 → 3.0  0" tells a reader that the
 * category exists and is empty, which a hidden filter does not.
 */
export function FilterChips({ legend, options, active, hrefFor, className }: FilterChipsProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-muted mr-1 text-[12.5px] font-medium">{legend}</span>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <a
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              selected ? TONE_SOLID.neutral : 'border-line text-ink hover:bg-surface-2 border',
            )}
          >
            {option.label}
            <span className={cn('tabular-nums', selected ? 'opacity-60' : 'text-muted')}>
              {option.count}
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ─── Findings count ─────────────────────────────────────────────────────────

/**
 * The link to the findings behind a project.
 *
 * Reads "19 findings" and nothing else. A severity breakdown belongs on the
 * findings page; on a card it competes with the numbers that are the point.
 */
export function FindingsLink({
  count,
  href,
  className,
}: {
  count: number;
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'text-ink hover:text-accent inline-flex items-center gap-1.5 text-[13.5px] font-medium transition-colors',
        className,
      )}
    >
      {count} finding{count === 1 ? '' : 's'}
      <span aria-hidden>↗</span>
    </a>
  );
}
