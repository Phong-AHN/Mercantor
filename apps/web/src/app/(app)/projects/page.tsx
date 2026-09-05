import type { Metadata } from 'next';
import Link from 'next/link';
import { clock } from '@relay/core';
import { can } from '@relay/rbac';
import { buttonStyles, PageHeader, PermissionDenied } from '@relay/ui';
import { parseFilters, type SearchParams } from '@/features/projects/filters';
import { listAssignableUsers, listProjects } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { FiltersBar } from './filters-bar';
import { ProjectBoard } from './project-board';
import { ProjectTable } from './project-table';

export const metadata: Metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const principal = await requirePrincipalOrRedirect('/projects');

  if (!can(principal, 'project:read')) {
    return <PermissionDenied />;
  }

  const params = await searchParams;
  const filters = parseFilters(params);
  const view = params.view === 'board' ? 'board' : 'table';

  const [projects, people] = await Promise.all([
    listProjects(principal, filters),
    listAssignableUsers(),
  ]);

  const now = clock.now();
  const showMoney = can(principal, 'invoice:read');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Every migration in one list. Filters live in the URL, so a filtered view is a link you can paste into Slack."
        actions={
          can(principal, 'project:create') ? (
            <Link href="/projects/new" className={buttonStyles('primary', 'md')}>
              New project
            </Link>
          ) : null
        }
      />

      <FiltersBar
        people={{
          ahn: people.ahn.map((person) => ({ id: person.id, name: person.name })),
          shopline: people.shopline.map((person) => ({ id: person.id, name: person.name })),
        }}
        view={view}
        total={projects.length}
      />

      {view === 'board' ? (
        <ProjectBoard projects={projects} now={now} />
      ) : (
        <ProjectTable projects={projects} now={now} showMoney={showMoney} />
      )}
    </div>
  );
}
