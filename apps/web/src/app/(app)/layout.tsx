import { redirect } from 'next/navigation';
import { clock } from '@relay/core';
import { isConfinedToOwnProjects, navigationFor } from '@relay/rbac';
import { MobileNav, Sidebar, Wordmark } from '@/components/shell/sidebar';
import { NotificationBell } from '@/components/shell/notification-bell';
import { SearchBox } from '@/components/shell/search-box';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { UserMenu } from '@/components/shell/user-menu';
import { getShellData } from '@/features/shell/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

/**
 * The internal surface. A merchant principal is bounced to the portal here, so
 * guessing an agency URL cannot land them on an agency-shaped page - the
 * enforcement is in the layout, not only in the menu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePrincipalOrRedirect();
  if (isConfinedToOwnProjects(principal)) redirect('/portal');

  const groups = navigationFor(principal);
  const { notifications, badges } = await getShellData(principal);

  const userMenu = (
    <UserMenu
      name={principal.name}
      email={principal.email}
      role={principal.role}
      team={principal.team}
    />
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={groups} badges={badges} footer={userMenu} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-canvas/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-md sm:px-5">
          <MobileNav groups={groups} badges={badges} footer={userMenu} />
          <div className="lg:hidden">
            <Wordmark />
          </div>

          <div className="mx-auto flex w-full max-w-2xl justify-center px-2">
            <SearchBox />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell
              items={notifications}
              unread={badges.notifications}
              now={clock.now().toISOString()}
            />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[86rem]">{children}</div>
        </main>

        <footer className="border-line text-faint border-t px-6 py-4 text-[11.5px]">
          Mercantor - one merchant, one project record, one source of truth. All times UTC.
        </footer>
      </div>
    </div>
  );
}
