'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, NavIcon } from '@relay/ui';

/**
 * Active state has to be computed on the client because it depends on the
 * current path. Everything else about the menu - which items exist at all -
 * is decided on the server from the permission matrix.
 */
export function NavLink({
  href,
  label,
  icon,
  badge,
  description,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  description?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={description}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] font-medium transition-colors',
        active
          ? 'bg-surface-1 text-ink shadow-card'
          : 'text-muted hover:bg-surface-2 hover:text-ink-soft',
      )}
    >
      <span
        className={cn(
          'bg-accent absolute -left-2 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full transition-opacity',
          active ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <NavIcon name={icon} className={cn('size-4 shrink-0', active ? 'text-accent' : '')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            'tabular shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-4',
            active ? 'bg-accent-soft text-accent-ink' : 'bg-surface-3 text-muted',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
