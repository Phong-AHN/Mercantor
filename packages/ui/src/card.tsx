import * as React from 'react';
import { cn } from './cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `flat` drops the shadow for cards that sit inside another card. */
  variant?: 'raised' | 'flat' | 'outline';
  padded?: boolean;
}

export function Card({ variant = 'raised', padded = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'border-line bg-surface-1 rounded-[var(--radius-lg)] border',
        variant === 'raised' && 'shadow-card',
        variant === 'flat' && 'shadow-none',
        variant === 'outline' && 'bg-transparent shadow-none',
        padded && 'p-5',
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  /** Renders a count next to the title, muted. */
  count?: number;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  count,
  className,
  children,
  ...rest
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4',
        className,
      )}
      {...rest}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="bg-surface-2 text-muted mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-ink flex items-center gap-2 text-[15px] font-semibold leading-6">
            <span className="truncate">{title}</span>
            {count !== undefined && (
              <span className="tabular bg-surface-2 text-muted rounded-full px-2 py-0.5 text-xs font-medium">
                {count}
              </span>
            )}
          </h2>
          {description && <p className="text-muted mt-0.5 text-[13px]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3',
        className,
      )}
      {...rest}
    />
  );
}
