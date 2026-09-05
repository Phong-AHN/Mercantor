import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isConfinedToOwnProjects, navigationFor } from '@relay/rbac';
import { NavLink } from '@/components/shell/nav-link';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { UserMenu } from '@/components/shell/user-menu';
import { getShellData } from '@/features/shell/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

/**
 * The merchant surface. A different product from the agency one: no portfolio,
 * no money, no internal notes. `withPortalAuth` in reverse - a non-merchant
 * principal is sent back to the agency app rather than shown a narrowed page,
 * so the two audiences never mix.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePrincipalOrRedirect('/portal');
  if (!isConfinedToOwnProjects(principal)) redirect('/dashboard');

  const groups = navigationFor(principal);
  const { badges } = await getShellData(principal);
  const items = groups.flatMap((group) => group.items);

  return (
    <div className="min-h-dvh">
      <header className="border-line bg-canvas/85 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="bg-accent grid size-8 place-items-center rounded-[10px]" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-4.5" fill="none">
                <path
                  d="M5 17V9.5A4.5 4.5 0 0 1 9.5 5H12"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M19 7v7.5a4.5 4.5 0 0 1-4.5 4.5H12"
                  stroke="white"
                  strokeOpacity="0.6"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>
              <span className="text-ink block text-[14px] font-semibold leading-4 tracking-tight">
                Your migration
              </span>
              <span className="text-muted block text-[10.5px] leading-4">AHN &times; SHOPLINE</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="bg-line w-px self-stretch" />
            <UserMenu
              name={principal.name}
              email={principal.email}
              role={principal.role}
              team={principal.team}
              compact
            />
          </div>
        </div>

        <nav
          aria-label="Portal sections"
          className="scrollbar-slim mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-5"
        >
          {items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              badge={item.badge ? badges[item.badge] : undefined}
            />
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {children}
      </main>

      <footer className="text-faint mx-auto max-w-5xl px-6 py-6 text-[11.5px]">
        You are seeing your own migration only. Questions go to your AHN project manager or your
        SHOPLINE account manager - both are listed on the overview.
      </footer>
    </div>
  );
}
