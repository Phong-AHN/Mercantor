import * as React from 'react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_DOT, TONE_SOFT, TONE_TEXT } from './tone';

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

/** The dashboard tile. Big number, small context, one tone. */
export function Stat({
  label,
  value,
  detail,
  tone = 'neutral',
  icon,
  trend,
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        'border-line bg-surface-1 shadow-card hover:shadow-raised group relative overflow-hidden rounded-[var(--radius-lg)] border p-4 transition-shadow',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted text-[12.5px] font-medium leading-4">{label}</p>
        {icon && (
          <span
            className={cn('grid size-7 shrink-0 place-items-center rounded-full', TONE_SOFT[tone])}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="tabular text-ink mt-3 text-[28px] font-semibold leading-8 tracking-tight">
        {value}
      </p>
      {(detail || trend) && (
        <div className="text-muted mt-1.5 flex items-center gap-2 text-[12.5px]">
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
      <span className={cn('absolute inset-x-0 bottom-0 h-0.5 opacity-70', TONE_DOT[tone])} />
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
    'relative block h-full rounded-[var(--radius-md)] border border-line bg-surface-1 text-left transition-colors',
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
