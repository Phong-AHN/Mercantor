import { can } from '@relay/rbac';
import { Card, CardHeader } from '@relay/ui';
import { LogFindingButton, ShareFindingsButton } from '@/components/qa/finding-controls';
import { FindingFiltersBar, FindingsList } from '@/components/qa/findings-list';
import { listAssignableUsers } from '@/features/projects/queries';
import { parseFindingFilters, type SearchParams } from '@/features/qa/filters';
import { getSiteQa, listFindings } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function ProjectFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa/findings`);
  const { filters, raw } = parseFindingFilters(await searchParams, principal.id);
  const base = `/projects/${code}/qa/findings`;

  const [qa, list, people] = await Promise.all([
    getSiteQa(principal, code),
    listFindings(principal, { ...filters, projectCode: code }),
    listAssignableUsers(principal.organizationId),
  ]);
  const canCreate = can(principal, 'finding:create');
  const canApprove = can(principal, 'finding:approve');
  const internal = !qa.merchant;
  const unsharedIds = list.rows
    .filter((row) => !row.clientVisibleAt && !row.falsePositive)
    .map((row) => row.id);

  return (
    <div className="space-y-4">
      <FindingFiltersBar
        base={base}
        raw={raw}
        bySeverity={list.bySeverity}
        people={
          internal ? people.all.map((person) => ({ id: person.id, name: person.name })) : undefined
        }
        showVisibility={internal}
      />
      <Card>
        <CardHeader
          title="Findings"
          count={list.rows.length}
          description="Automated checks and what people reported. New → reviewed → in progress → ready for verification → resolved."
          actions={
            <>
              {canApprove && unsharedIds.length > 0 && (
                <ShareFindingsButton
                  code={code}
                  findingIds={unsharedIds}
                  visible
                  label={`Share ${unsharedIds.length} listed`}
                />
              )}
              {canCreate && (
                <LogFindingButton
                  code={code}
                  people={people.all.map((person) => ({ id: person.id, name: person.name }))}
                  pages={qa.pages.map((page) => page.url)}
                />
              )}
            </>
          }
        />
        <FindingsList
          rows={list.rows}
          hrefFor={(row) => `${base}/${row.reference}`}
          showVisibility={internal}
        />
      </Card>
    </div>
  );
}
