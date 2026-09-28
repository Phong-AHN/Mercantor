'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn, MenuButton, type TabItem } from '@relay/ui';

export interface ProjectTab extends TabItem {
  /** Shown in the strip. Everything else lives under "More", in the same order. */
  primary: boolean;
  /** What the count counts, singular and plural - read out and shown on hover. */
  countNoun?: readonly [string, string];
}

function countText(item: ProjectTab): string | undefined {
  if (item.count === undefined || !item.countNoun) return undefined;
  return `${item.count} ${item.count === 1 ? item.countNoun[0] : item.countNoun[1]}`;
}

/** The number says what it counts on hover and to a screen reader: "2 open questions", not "2". */
function CountPill({ item, active }: { item: ProjectTab; active: boolean }) {
  const text = countText(item);
  return (
    <span
      title={text}
      className={cn(
        'tabular rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-4',
        active ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted',
      )}
    >
      <span aria-hidden={text ? true : undefined}>{item.count}</span>
      {text && <span className="sr-only">{text}</span>}
    </span>
  );
}

function AttentionDot({ label }: { label: string }) {
  return (
    <>
      <span className="bg-danger size-1.5 rounded-full" aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * The tab strip needs the current path, which only the client knows. It uses
 * real links so every sub-view stays addressable - people paste project links
 * into Slack all day, and a tab that is only client state cannot be shared.
 *
 * Fourteen tabs in one row is a wall, so the ones used every day stay in the
 * strip and the rest sit under "More". Nothing is removed: every tab is still
 * one click away, and when the page you are on is one of the "More" tabs the
 * button names it, so you can always see where you are.
 */
export function ProjectTabs({ items, base }: { items: readonly ProjectTab[]; base: string }) {
  const pathname = usePathname();
  // Whole path segments only: `/timeline` starts with `/time`, and a plain
  // prefix check lit up Time & SLA on the Events page.
  const isActive = (item: TabItem) =>
    item.href === base
      ? pathname === base
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const primary = items.filter((item) => item.primary);
  const more = items.filter((item) => !item.primary);
  const activeMore = more.find(isActive);
  const moreNeedsAttention = more.some((item) => item.alert);

  // On a phone only two or three tabs fit; bring the current one into view
  // so "where am I" never needs a sideways scroll to answer.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !current) return;
    const left = current.offsetLeft - strip.offsetLeft;
    if (
      left < strip.scrollLeft ||
      left + current.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollLeft = Math.max(0, left - 16);
    }
  }, [pathname]);

  return (
    <div className="border-line -mb-px flex items-end border-b">
      <div
        ref={stripRef}
        className="scrollbar-slim relative min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] sm:[mask-image:none]"
      >
        <nav
          className="flex min-w-max items-center gap-0.5 pr-6 sm:pr-0"
          aria-label="Project sections"
        >
          {primary.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-accent relative flex items-center gap-1.5 whitespace-nowrap rounded-t-[var(--radius-sm)] border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                  active
                    ? 'border-accent text-ink'
                    : 'text-muted hover:border-line-strong hover:text-ink-soft border-transparent',
                )}
              >
                {item.label}
                {item.count !== undefined && item.count > 0 && (
                  <CountPill item={item} active={active} />
                )}
                {item.alert && <AttentionDot label="needs attention" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {more.length > 0 && (
        <MenuButton
          label={activeMore ? `More sections, current: ${activeMore.label}` : 'More sections'}
          linkAs={Link}
          className="shrink-0"
          triggerClassName={cn(
            'focus-visible:ring-accent flex items-center gap-1.5 whitespace-nowrap rounded-t-[var(--radius-sm)] border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
            activeMore
              ? 'border-accent text-ink'
              : 'text-muted hover:border-line-strong hover:text-ink-soft border-transparent',
          )}
          items={more.map((item) => ({
            key: item.href,
            label: item.label,
            href: item.href,
            current: isActive(item),
            trailing: (
              <span className="flex items-center gap-1.5">
                {item.count !== undefined && item.count > 0 && (
                  <CountPill item={item} active={false} />
                )}
                {item.alert && <AttentionDot label="needs attention" />}
              </span>
            ),
          }))}
        >
          {activeMore ? activeMore.label : 'More'}
          {!activeMore && moreNeedsAttention && (
            <AttentionDot label="something under More needs attention" />
          )}
          <ChevronDown className="size-3.5" aria-hidden />
        </MenuButton>
      )}
    </div>
  );
}
