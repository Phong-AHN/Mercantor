import * as React from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-card hover:brightness-110 active:brightness-95 disabled:bg-accent/50',
  secondary:
    'bg-surface-1 text-ink border border-line-strong shadow-card hover:bg-surface-2 active:bg-surface-3',
  subtle: 'bg-surface-2 text-ink-soft hover:bg-surface-3 active:bg-line',
  ghost: 'text-ink-soft hover:bg-surface-2 active:bg-surface-3',
  danger: 'bg-danger text-white shadow-card hover:brightness-110 active:brightness-95',
  link: 'text-accent-ink underline-offset-4 hover:underline p-0 h-auto',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-xs)]',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-[var(--radius-md)]',
};

/** Shared class recipe, so an anchor can look like a button without nesting one inside the other. */
export function buttonStyles(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'relative inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background,box-shadow,filter,transform] duration-150',
    'disabled:pointer-events-none disabled:opacity-55 active:translate-y-px',
    VARIANT[variant],
    variant !== 'link' && SIZE[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks the click without changing the width. */
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center whitespace-nowrap font-medium transition-[background,box-shadow,filter,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-55',
        'active:translate-y-px',
        VARIANT[variant],
        variant !== 'link' && SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="absolute" />}
      <span className={cn('inline-flex items-center gap-[inherit]', loading && 'opacity-0')}>
        {children}
      </span>
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control still needs an accessible name. */
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-sm)] transition-colors',
        'disabled:pointer-events-none disabled:opacity-55',
        VARIANT[variant],
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
