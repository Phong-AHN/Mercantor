'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn, type TabItem } from '@relay/ui';

/**
 * The tab strip needs the current path, which only the client knows. It uses
 * real links so every sub-view stays addressable - people paste project links
 * into Slack all day, and a tab that is only client state cannot be shared.
 */
export function ProjectTabs({ items, base }: { items: readonly TabItem[]; base: string }) {
  const pathname = usePathname();

  return (
    <div className="scrollbar-slim border-line -mb-px overflow-x-auto border-b">
      <nav className="flex min-w-max items-center gap-0.5" aria-label="Project sections">
        {items.map((item) => {
          const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors',
                active
                  ? 'border-accent text-ink'
                  : 'text-muted hover:border-line-strong hover:text-ink-soft border-transparent',
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-4',
                    active ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  {item.count}
                </span>
              )}
              {item.alert && <span className="bg-danger size-1.5 rounded-full" aria-hidden />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
