import type { Metadata } from 'next';
import Link from 'next/link';
import {
  clock,
  formatDate,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  TEAM_LABEL,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Card,
  Empty,
  FilterPills,
  Mono,
  PageHeader,
  PermissionDenied,
  Stat,
  StatusPill,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { DueDate, ProjectLink, StagePill } from '@/components/domain';
import { listIssues } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Issues' };
export const dynamic = 'force-dynamic';

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const principal = await requirePrincipalOrRedirect('/issues');
  if (!can(principal, 'issue:read')) return <PermissionDenied />;

  const { view } = await searchParams;
  const onlyOpen = view !== 'all';
  const issues = await listIssues(principal, { onlyOpen });
  const all = await listIssues(principal);
  const now = clock.now();

  const open = all.filter((issue) =>
    ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'].includes(issue.status),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Issues & escalations"
        description="Everything reported across the portfolio, worst first. A launch blocker turns its project red on its own."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ISSUE_SEVERITIES.slice()
          .reverse()
          .map((severity) => {
            const count = open.filter((issue) => issue.severity === severity).length;
            return (
              <Stat
                key={severity}
                label={ISSUE_SEVERITY_LABEL[severity].label}
                value={count}
                detail={count === 0 ? 'None open' : 'Open across all projects'}
                tone={count === 0 ? 'success' : ISSUE_SEVERITY_LABEL[severity].tone}
              />
            );
          })}
      </div>

      <FilterPills
        items={[
          { href: '/issues', label: 'Open', count: open.length, active: onlyOpen },
          { href: '/issues?view=all', label: 'Everything', count: all.length, active: !onlyOpen },
        ]}
      />

      {issues.length === 0 ? (
        <Card>
          <Empty
            title="No issues"
            description="Nothing is escalated right now."
            className="py-14"
          />
        </Card>
      ) : (
        <TableScroller>
          <Table>
            <THead>
              <tr>
                <TH>Ref</TH>
                <TH className="min-w-[13rem]">Project</TH>
                <TH className="min-w-[20rem]">Issue</TH>
                <TH>Severity</TH>
                <TH>Status</TH>
                <TH>Owner</TH>
                <TH>Due</TH>
                <TH>Reported</TH>
              </tr>
            </THead>
            <TBody>
              {issues.map((issue) => (
                <TR key={issue.id} interactive>
                  <TD>
                    <Mono>{issue.reference}</Mono>
                  </TD>
                  <TD>
                    <ProjectLink code={issue.project.code} name={issue.project.merchant.name} />
                    <div className="mt-1">
                      <StagePill stage={issue.project.stage} size="sm" />
                    </div>
                  </TD>
                  <TD>
                    <Link
                      href={`/projects/${issue.project.code}/issues`}
                      className="text-ink hover:text-accent-ink text-[13px] font-medium leading-5"
                    >
                      {issue.title}
                    </Link>
                  </TD>
                  <TD>
                    <StatusPill descriptor={ISSUE_SEVERITY_LABEL[issue.severity]} size="sm" />
                  </TD>
                  <TD>
                    <StatusPill descriptor={ISSUE_STATUS_LABEL[issue.status]} size="sm" />
                  </TD>
                  <TD className="text-ink-soft text-[12.5px]">
                    {issue.owner?.name ?? TEAM_LABEL[issue.ownerTeam].label}
                  </TD>
                  <TD>
                    <DueDate date={issue.dueDate} now={now} />
                  </TD>
                  <TD className="text-muted text-[12.5px]">{formatDate(issue.reportedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroller>
      )}
    </div>
  );
}
