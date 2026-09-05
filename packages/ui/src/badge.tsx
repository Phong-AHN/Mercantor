import * as React from 'react';
import { TEAM_LABEL, type Descriptor, type Team, type Tone } from '@relay/core';
import { cn } from './cn';
import { TEAM_BAR, TONE_BORDER, TONE_DOT, TONE_SOFT, TONE_SOLID } from './tone';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: 'soft' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  /** Adds a leading status dot - the fastest read in a dense table. */
  dot?: boolean;
}

export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  dot,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        variant === 'soft' && TONE_SOFT[tone],
        variant === 'solid' && TONE_SOLID[tone],
        variant === 'outline' && cn('border bg-transparent', TONE_BORDER[tone]),
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

/**
 * Renders a domain `Descriptor` - the label and tone that `@relay/core`
 * already decided. Screens never re-decide how a status looks.
 */
export function StatusPill({
  descriptor,
  size = 'md',
  variant = 'soft',
  dot = true,
  className,
}: {
  descriptor: Descriptor;
  size?: 'sm' | 'md';
  variant?: 'soft' | 'solid' | 'outline';
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge
      tone={descriptor.tone}
      size={size}
      variant={variant}
      dot={dot}
      className={className}
      title={descriptor.hint}
    >
      {descriptor.label}
    </Badge>
  );
}

export function TeamChip({
  team,
  size = 'md',
  className,
}: {
  team: Team;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const descriptor = TEAM_LABEL[team];
  return (
    <span
      className={cn(
        'bg-surface-2 text-ink-soft inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', TEAM_BAR[team])} />
      {descriptor.label}
    </span>
  );
}

/** Monospaced identifier - project codes, issue references, store ids. */
export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'bg-surface-2 text-muted rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-[11.5px] tracking-tight',
        className,
      )}
    >
      {children}
    </span>
  );
}
