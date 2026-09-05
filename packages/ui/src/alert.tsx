import * as React from 'react';
import { CircleAlert, CircleCheck, Info, OctagonAlert } from 'lucide-react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_BORDER, TONE_SOFT, TONE_TEXT } from './tone';

const ICON: Partial<Record<Tone, React.ComponentType<{ className?: string }>>> = {
  success: CircleCheck,
  warning: CircleAlert,
  danger: OctagonAlert,
  info: Info,
  accent: Info,
};

export interface AlertProps {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Overrides the tone's default icon. */
  icon?: React.ReactNode;
  className?: string;
  /** Compact form for inline use under a field or above a table. */
  dense?: boolean;
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
  dense,
}: AlertProps) {
  const Icon = ICON[tone] ?? Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-md)] border',
        TONE_BORDER[tone],
        TONE_SOFT[tone],
        dense ? 'px-3 py-2' : 'px-4 py-3.5',
        className,
      )}
    >
      <span className={cn('mt-0.5 shrink-0 [&>svg]:size-4', TONE_TEXT[tone])}>
        {icon ?? <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-[13.5px] font-semibold leading-5">{title}</p>}
        {children && (
          <div className={cn('text-[13px] leading-5 opacity-90', title && 'mt-0.5')}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * A banner that names the one thing standing in the way. Used at the top of a
 * project when a blocker is open - the brief asks for the current blocker to be
 * prominent, and prominence means "before anything else on the page".
 */
export function BlockerBanner({
  title,
  owner,
  duration,
  nextAction,
  dueDate,
  href,
  className,
}: {
  title: string;
  owner: string;
  duration: string;
  nextAction?: string | null;
  dueDate?: string | null;
  href?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-danger/40 bg-danger-soft relative overflow-hidden rounded-[var(--radius-lg)] border',
        className,
      )}
    >
      <span className="bg-danger absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-wrap items-center justify-between gap-4 py-3.5 pl-5 pr-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-danger/15 text-danger-ink pulse-ring mt-0.5 grid size-8 shrink-0 place-items-center rounded-full">
            <OctagonAlert className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-danger-ink/80 text-[11px] font-semibold uppercase tracking-wider">
              Current blocker &middot; open {duration}
            </p>
            <p className="text-danger-ink truncate text-[15px] font-semibold leading-5">{title}</p>
            <p className="text-danger-ink/85 mt-0.5 text-[12.5px]">
              Owned by <span className="font-semibold">{owner}</span>
              {nextAction ? ` - next: ${nextAction}` : ''}
              {dueDate ? ` (due ${dueDate})` : ''}
            </p>
          </div>
        </div>
        {href && (
          <a
            href={href}
            className="bg-danger shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            Manage blocker
          </a>
        )}
      </div>
    </div>
  );
}
