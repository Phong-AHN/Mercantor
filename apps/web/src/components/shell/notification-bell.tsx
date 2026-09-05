'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { NOTIFICATION_TYPE_LABEL, formatRelative, type NotificationType } from '@relay/core';
import { cn, Empty, TONE_DOT } from '@relay/ui';
import { markNotificationsReadAction } from '@/features/notifications/actions';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  read: boolean;
}

export function NotificationBell({
  items,
  unread,
  now,
}: {
  items: readonly NotificationItem[];
  unread: number;
  now: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nowDate = new Date(now);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className={cn(
          'text-ink-soft hover:bg-surface-2 relative grid size-9 place-items-center rounded-[var(--radius-sm)] transition-colors',
          open && 'bg-surface-2',
        )}
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="tabular bg-danger absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="rise border-line bg-surface-1 shadow-overlay absolute right-0 z-40 mt-2 w-[22rem] overflow-hidden rounded-[var(--radius-md)] border">
          <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-ink text-[13px] font-semibold">Notifications</p>
            {unread > 0 && (
              <form action={markNotificationsReadAction}>
                <button
                  type="submit"
                  className="text-accent-ink text-[12px] font-medium underline-offset-4 hover:underline"
                >
                  Mark all read
                </button>
              </form>
            )}
          </div>

          <div className="scrollbar-slim max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <Empty
                title="Nothing needs you"
                description="Blockers, approvals and overdue items land here."
                className="py-10"
              />
            ) : (
              <ul className="divide-line divide-y">
                {items.map((item) => {
                  const descriptor = NOTIFICATION_TYPE_LABEL[item.type];
                  const body = (
                    <>
                      <span className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                            item.read ? 'bg-line-strong' : TONE_DOT[descriptor.tone],
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-muted block text-[11px] font-medium">
                            {descriptor.label}
                          </span>
                          <span
                            className={cn(
                              'block text-[13px] leading-5',
                              item.read ? 'text-muted' : 'text-ink font-medium',
                            )}
                          >
                            {item.title}
                          </span>
                          {item.body && (
                            <span className="text-muted mt-0.5 line-clamp-2 block text-[12px] leading-4">
                              {item.body}
                            </span>
                          )}
                          <span className="text-faint mt-1 block text-[11px]">
                            {formatRelative(new Date(item.createdAt), nowDate)}
                          </span>
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="hover:bg-surface-2 block px-4 py-3 transition-colors"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
