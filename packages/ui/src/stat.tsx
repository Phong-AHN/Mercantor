import * as React from 'react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_TEXT } from './tone';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** One supporting line. Keep it to a fact, not a sentence. */
  detail?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string; good?: boolean };
  href?: string;
  className?: string;
}

/**
 * The dashboard tile: label, big number, one supporting fact. The tone colours
 * the small glyph beside the label and, when something is wrong (danger or
 * warning), the number itself - colour only where it means something.
 * Inside a `.stat-group` wrapper the tiles join into one hairline-divided
 * strip instead of floating as separate cards.
 */
export function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
  icon,
  trend,
  className,
}: StatProps) {
  const alarming = tone === 'danger' || tone === 'warning';
  return (
    <div
      className={cn(
        'border-line bg-surface-1 relative rounded-[var(--radius-lg)] border px-4 py-3.5',
        '[.stat-group_&]:rounded-none [.stat-group_&]:border-0',
        className,
      )}
    >
      <p className="text-muted flex items-center gap-1.5 text-[12.5px] font-medium leading-4">
        {icon && (
          <span className={cn('shrink-0 [&_svg]:size-3.5', TONE_TEXT[tone])} aria-hidden>
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          'tabular mt-2.5 text-[26px] font-semibold leading-8 tracking-[-0.03em]',
          alarming ? TONE_TEXT[tone] : 'text-ink',
        )}
      >
        {value}
      </p>
      {(detail || trend) && (
        <div className="text-muted mt-1 flex items-center gap-2 text-[12.5px]">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                trend.good === undefined
                  ? 'text-muted'
                  : trend.good
                    ? 'text-success-ink'
                    : 'text-danger-ink',
              )}
            >
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■'}
              {trend.label}
            </span>
          )}
          {detail && <span className="min-w-0 truncate">{detail}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The answer tile used on the project header strip: a question, its computed
 * answer, and the fact behind it.
 */
export function AnswerTile({
  question,
  value,
  detail,
  tone = 'neutral',
  href,
  density = 'regular',
  linkAs: LinkComponent = 'a',
  className,
}: {
  question: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
  href?: string;
  /** `compact` keeps a strip of ten readable without taking the first screen. */
  density?: 'regular' | 'compact';
  /** Pass the app router's Link so tiles navigate client-side. */
  linkAs?: React.ElementType;
  className?: string;
}) {
  const compact = density === 'compact';
  const valueText = typeof value === 'string' ? value : undefined;
  const content = (
    <>
      <p className="text-muted text-[11.5px] font-medium leading-4">{question}</p>
      <p
        className={cn(
          'truncate font-semibold',
          compact ? 'mt-0.5 text-[14px] leading-5' : 'mt-1 text-[15px] leading-5',
          TONE_TEXT[tone],
        )}
        title={valueText}
      >
        {value}
      </p>
      {detail && (
        <p
          className={cn(
            'text-muted text-[12px] leading-4',
            compact ? 'mt-0.5 truncate' : 'mt-1 line-clamp-2',
          )}
          title={compact && typeof detail === 'string' ? detail : undefined}
        >
          {detail}
        </p>
      )}
    </>
  );

  const shell = cn(
    'relative block h-full rounded-[var(--radius-md)] border border-line bg-surface-1 text-left transition-colors duration-150',
    compact ? 'px-3 py-2.5' : 'p-3.5',
    href &&
      'hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    className,
  );

  return href ? (
    <LinkComponent href={href} className={shell}>
      {content}
    </LinkComponent>
  ) : (
    <div className={shell}>{content}</div>
  );
}

/** A compact key/value row for detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="text-muted shrink-0 text-[13px]">{label}</dt>
      <dd className="text-ink min-w-0 text-right text-[13px] font-medium">{children}</dd>
    </div>
  );
}

export function DetailList({ className, ...rest }: React.HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('divide-line divide-y', className)} {...rest} />;
}
