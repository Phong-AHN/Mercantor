import type { Metadata } from 'next';
import { db, type Prisma } from '@relay/db';
import { can, isConfinedToOwnProjects, projectScopeWhere } from '@relay/rbac';
import { Card, CardHeader, PageHeader, PermissionDenied } from '@relay/ui';
import { FindingFiltersBar, FindingsList } from '@/components/qa/findings-list';
import { listAssignableUsers } from '@/features/projects/queries';
import { parseFindingFilters, type SearchParams } from '@/features/qa/filters';
import { listFindings } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Findings' };
export const dynamic = 'force-dynamic';

export default async function FindingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePrincipalOrRedirect('/findings');
  if (!can(principal, 'finding:read')) return <PermissionDenied />;

  const { filters, raw } = parseFindingFilters(await searchParams, principal.id);
  const internal = !isConfinedToOwnProjects(principal);

  const [list, people, projects] = await Promise.all([
    listFindings(principal, filters),
    listAssignableUsers(principal.organizationId),
    db.project.findMany({
      where: {
        ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput),
        findings: { some: {} },
      },
      orderBy: { merchant: { name: 'asc' } },
      select: { code: true, merchant: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Findings"
        description="Content, link, image, layout and performance problems across every storefront, newest first."
      />
      <FindingFiltersBar
        base="/findings"
        raw={raw}
        bySeverity={list.bySeverity}
        people={internal ? people.all.map((person) => ({ id: person.id, name: person.name })) : undefined}
        showVisibility={internal}
        projects={projects.map((project) => ({ code: project.code, name: project.merchant.name }))}
      />
      <Card>
        <CardHeader title="Results" count={list.rows.length} />
        <FindingsList
          rows={list.rows}
          hrefFor={(row) =>
            internal ? `/projects/${row.project.code}/qa/findings/${row.reference}` : `/portal/qa/findings/${row.reference}`
          }
          showProject
          showVisibility={internal}
        />
      </Card>
    </div>
  );
}
