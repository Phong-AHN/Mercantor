'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { USER_ROLE_LABEL, type Team, type UserRole } from '@relay/core';
import { Avatar, cn } from '@relay/ui';
import { signOutAction } from '@/features/auth/actions';

export function UserMenu({
  name,
  email,
  role,
  team,
  compact,
}: {
  name: string;
  email: string;
  role: UserRole;
  team: Team;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
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
        aria-haspopup="menu"
        className={cn(
          'hover:bg-surface-2 flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] p-1.5 text-left transition-colors',
          open && 'bg-surface-2',
        )}
      >
        <Avatar name={name} team={team} size={compact ? 'sm' : 'md'} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-[12.5px] font-medium leading-4">
              {name}
            </span>
            <span className="text-muted block truncate text-[11px] leading-4">
              {USER_ROLE_LABEL[role].label}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="rise border-line bg-surface-1 shadow-overlay absolute bottom-full right-0 z-40 mb-2 w-64 overflow-hidden rounded-[var(--radius-md)] border"
        >
          <div className="border-line border-b px-3.5 py-3">
            <p className="text-ink truncate text-[13px] font-semibold">{name}</p>
            <p className="text-muted truncate text-[12px]">{email}</p>
            <p className="bg-surface-2 text-muted mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium">
              {USER_ROLE_LABEL[role].label}
            </p>
          </div>
          <div className="p-1">
            <a
              href="/my-work"
              role="menuitem"
              className="text-ink-soft hover:bg-surface-2 flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] transition-colors"
            >
              <UserRound className="text-muted size-4" />
              Your work
            </a>
            <form action={signOutAction}>
              <button
                type="submit"
                role="menuitem"
                className="text-danger-ink hover:bg-danger-soft flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] transition-colors"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
