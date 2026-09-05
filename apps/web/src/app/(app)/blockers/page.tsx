import type { Metadata } from 'next';
import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import {
  BLOCKER_CATEGORY_LABEL,
  clock,
  formatDuration,
  TEAM_LABEL,
  TEAMS,
  type Team,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Card,
  Empty,
  FilterPills,
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
import { DueDate, HealthPill, ProjectLink, StagePill } from '@/components/domain';
import { listOpenBlockers } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Blockers' };
export const dynamic = 'force-dynamic';

export default async function BlockersPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const principal = await requirePrincipalOrRedirect('/blockers');
  if (!can(principal, 'blocker:read')) return <PermissionDenied />;

  const { owner } = await searchParams;
  const ownerTeam = (TEAMS as readonly string[]).includes(owner ?? '')
    ? (owner as Team)
    : undefined;

  const [blockers, all] = await Promise.all([
    listOpenBlockers(principal, ownerTeam),
    listOpenBlockers(principal),
  ]);

  const now = clock.now();
  const oldest = all[0];
  const overdue = all.filter(
    (blocker) => blocker.dueDate !== null && blocker.dueDate.getTime() < now.getTime(),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Blockers"
        description="Everything currently stopping a migration, oldest first. Each one is charged to whoever owns it right now."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open"
          value={all.length}
          detail={`across ${new Set(all.map((blocker) => blocker.project.id)).size} project(s)`}
          tone={all.length === 0 ? 'success' : 'danger'}
          icon={<OctagonAlert className="size-3.5" />}
        />
        <Stat
          label="Past their due date"
          value={overdue.length}
          detail={overdue.length === 0 ? 'Nothing overdue' : 'Chase these first'}
          tone={overdue.length === 0 ? 'success' : 'warning'}
        />
        <Stat
          label="Oldest"
          value={oldest ? formatDuration(oldest.ageMs, { compact: true }) : '-'}
          detail={oldest ? oldest.project.merchant.name : 'Nothing is blocked'}
          tone={oldest ? 'danger' : 'success'}
        />
        <Stat
          label="Waiting on the merchant"
          value={all.filter((blocker) => blocker.ownerTeam === 'MERCHANT').length}
          detail="The most common cause of delay"
          tone="warning"
        />
      </div>

      <FilterPills
        items={[
          { href: '/blockers', label: 'All', count: all.length, active: !ownerTeam },
          ...TEAMS.map((team) => ({
            href: `/blockers?owner=${team}`,
            label: TEAM_LABEL[team].label,
            count: all.filter((blocker) => blocker.ownerTeam === team).length,
            active: ownerTeam === team,
          })),
        ]}
      />

      {blockers.length === 0 ? (
        <Card>
          <Empty
            title="Nothing is blocked"
            description="Every active migration has a clear next step and somebody working on it."
            className="py-14"
          />
        </Card>
      ) : (
        <TableScroller>
          <Table>
            <THead>
              <tr>
                <TH className="min-w-[13rem]">Project</TH>
                <TH className="min-w-[18rem]">Blocker</TH>
                <TH>Category</TH>
                <TH>Owner</TH>
                <TH numeric>Open for</TH>
                <TH>Due</TH>
                <TH className="min-w-[14rem]">Next action</TH>
              </tr>
            </THead>
            <TBody>
              {blockers.map((blocker) => (
                <TR key={blocker.id} interactive>
                  <TD>
                    <ProjectLink code={blocker.project.code} name={blocker.project.merchant.name} />
                    <div className="mt-1 flex items-center gap-1.5">
                      <StagePill stage={blocker.project.stage} size="sm" />
                      <HealthPill health={blocker.project.health} size="sm" />
                    </div>
                  </TD>
                  <TD>
                    <Link
                      href={`/projects/${blocker.project.code}/blockers`}
                      className="text-ink hover:text-accent-ink block text-[13px] font-medium leading-5"
                    >
                      {blocker.title}
                    </Link>
                    {blocker.description && (
                      <p className="text-muted mt-0.5 line-clamp-2 text-[11.5px]">
                        {blocker.description}
                      </p>
                    )}
                  </TD>
                  <TD>
                    <StatusPill descriptor={BLOCKER_CATEGORY_LABEL[blocker.category]} size="sm" />
                  </TD>
                  <TD className="text-ink-soft text-[12.5px]">
                    {blocker.owner?.name ?? TEAM_LABEL[blocker.ownerTeam].label}
                    {blocker.owner && (
                      <span className="text-faint block text-[11px]">
                        {TEAM_LABEL[blocker.ownerTeam].label}
                      </span>
                    )}
                  </TD>
                  <TD numeric>
                    <span className="tabular text-danger-ink text-[13px] font-semibold">
                      {formatDuration(blocker.ageMs, { compact: true })}
                    </span>
                  </TD>
                  <TD>
                    <DueDate date={blocker.dueDate} now={now} />
                  </TD>
                  <TD className="text-muted text-[12.5px]">{blocker.nextAction ?? '-'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroller>
      )}
    </div>
  );
}
