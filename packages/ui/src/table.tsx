import * as React from 'react';
import { cn } from './cn';

/**
 * Table primitives rather than a data-grid component. The portfolio table needs
 * bespoke cells - stage pills, ageing meters, blocker owners - and a generic
 * grid would fight that. What is shared is the chrome: sticky header, hairline
 * rows, hover, and horizontal scroll that never spills onto the page.
 */

export function TableScroller({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'scrollbar-slim border-line bg-surface-1 shadow-card w-full overflow-x-auto rounded-[var(--radius-lg)] border',
        className,
      )}
      {...rest}
    />
  );
}

export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full border-collapse text-left text-[13px]', className)} {...rest} />
  );
}

export function THead({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-surface-2/85 sticky top-0 z-10 backdrop-blur-sm', className)}
      {...rest}
    />
  );
}

export function TH({
  align = 'left',
  numeric,
  className,
  children,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-line text-muted whitespace-nowrap border-b px-3.5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TBody({ className, ...rest }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-line divide-y', className)} {...rest} />;
}

export function TR({
  interactive,
  className,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors',
        interactive && 'hover:bg-surface-2 focus-within:bg-surface-2 cursor-pointer',
        className,
      )}
      {...rest}
    />
  );
}

export function TD({
  align = 'left',
  numeric,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'text-ink px-3.5 py-3 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular',
        className,
      )}
      {...rest}
    />
  );
}

/** A full-width message row that keeps the table's column structure. */
export function TableMessage({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center">
        {children}
      </td>
    </tr>
  );
}
