import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Chips shown under the title: stage, health, migration type. */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-muted mb-1 flex items-center gap-2 text-[12px] font-medium">
            {eyebrow}
          </div>
        )}
        <h1 className="text-ink text-[22px] font-semibold leading-7 tracking-tight sm:text-[26px] sm:leading-8">
          {title}
        </h1>
        {description && (
          <p className="text-muted mt-1.5 max-w-2xl text-[13.5px] leading-5">{description}</p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: readonly { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-[12.5px]', className)}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 && <ChevronRight className="text-faint size-3.5 shrink-0" aria-hidden />}
          {item.href ? (
            <a href={item.href} className="text-muted hover:text-ink truncate transition-colors">
              {item.label}
            </a>
          ) : (
            <span className="text-ink-soft truncate font-medium" aria-current="page">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export interface TabItem {
  href: string;
  label: string;
  count?: number;
  /** Rendered as a red dot: something here needs attention. */
  alert?: boolean;
}

/**
 * Link-based tabs. Keeping them as real links means every project sub-view is
 * addressable, shareable and back-button friendly - which matters a lot when
 * people paste project links into Slack all day.
 */
export function Tabs({
  items,
  active,
  className,
}: {
  items: readonly TabItem[];
  active: string;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-slim border-line -mb-px overflow-x-auto border-b', className)}>
      <nav className="flex min-w-max items-center gap-0.5" aria-label="Sections">
        {items.map((item) => {
          const isActive = item.href === active;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                isActive
                  ? 'border-accent text-ink'
                  : 'text-muted hover:border-line-strong hover:text-ink-soft border-transparent',
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-4',
                    isActive ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  {item.count}
                </span>
              )}
              {item.alert && <span className="bg-danger size-1.5 rounded-full" aria-hidden />}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  id,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-24 space-y-3', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-ink text-[15px] font-semibold leading-5 tracking-tight">
                {title}
              </h2>
            )}
            {description && <p className="text-muted mt-1 text-[12.5px]">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A small pill row used for filters that are links, not form state. */
export function FilterPills({
  items,
  className,
}: {
  items: readonly { href: string; label: string; count?: number; active: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-slim flex gap-1.5 overflow-x-auto pb-1', className)}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            item.active
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line bg-surface-1 text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="tabular text-[11px] opacity-70">{item.count}</span>
          )}
        </a>
      ))}
    </div>
  );
}
