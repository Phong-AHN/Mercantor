import * as React from 'react';
import { CircleSlash, Inbox, Lock, TriangleAlert } from 'lucide-react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { Button, buttonStyles } from './button';
import { TONE_SOFT } from './tone';

/**
 * Required UI states, as components rather than ad-hoc markup. A feature that
 * ships without them is incomplete - the convention that made the previous
 * project's screens consistent.
 */

export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14', className)}
      role="status"
      aria-live="polite"
    >
      <svg className="text-accent size-6 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-muted text-[13px]">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-[var(--radius-sm)]', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

export interface StateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  action?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string };
  className?: string;
}

function StateShell({
  title,
  description,
  icon,
  tone = 'muted',
  action,
  secondaryAction,
  className,
}: StateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className={cn('mb-4 grid size-12 place-items-center rounded-full', TONE_SOFT[tone])}>
        {icon}
      </span>
      <h3 className="text-ink text-[15px] font-semibold">{title}</h3>
      {description && (
        <p className="text-muted mt-1.5 max-w-md text-[13px] leading-5">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-2">
          {action &&
            (action.href ? (
              <a href={action.href} className={buttonStyles('primary', 'sm')}>
                {action.label}
              </a>
            ) : (
              <Button variant="primary" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          {secondaryAction?.href && (
            <a
              href={secondaryAction.href}
              className="text-accent-ink text-[13px] font-medium underline-offset-4 hover:underline"
            >
              {secondaryAction.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function Empty(props: Omit<StateProps, 'icon' | 'tone'> & { icon?: React.ReactNode }) {
  return <StateShell {...props} tone="muted" icon={props.icon ?? <Inbox className="size-5" />} />;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The page could not be loaded. Try again, and tell us if it keeps happening.',
  ...rest
}: Partial<StateProps>) {
  return (
    <StateShell
      {...rest}
      title={title}
      description={description}
      tone="danger"
      icon={<TriangleAlert className="size-5" />}
    />
  );
}

export function PermissionDenied({
  title = 'You do not have access to this',
  description = 'Your role does not include this area of the portal. Ask an administrator if you think that is wrong.',
  ...rest
}: Partial<StateProps>) {
  return (
    <StateShell
      {...rest}
      title={title}
      description={description}
      tone="warning"
      icon={<Lock className="size-5" />}
    />
  );
}

export function NotFoundState({
  title = 'Not found',
  description = 'This record does not exist, or it is not one you can see.',
  ...rest
}: Partial<StateProps>) {
  return (
    <StateShell
      {...rest}
      title={title}
      description={description}
      tone="muted"
      icon={<CircleSlash className="size-5" />}
    />
  );
}
