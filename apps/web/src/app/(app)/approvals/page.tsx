import type { Metadata } from 'next';
import Link from 'next/link';
import { APPROVAL_TYPE_LABEL, clock, formatRelative } from '@relay/core';
import { can } from '@relay/rbac';
import { Badge, Card, CardHeader, Empty, PageHeader, PermissionDenied, Stat } from '@relay/ui';
import { HealthPill, ProjectLink, StagePill } from '@/components/domain';
import { listPendingApprovals } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const principal = await requirePrincipalOrRedirect('/approvals');
  if (!can(principal, 'approval:read')) return <PermissionDenied />;

  const approvals = await listPendingApprovals(principal);
  const now = clock.now();
  const mine = approvals.filter((approval) => approval.mine);
  const others = approvals.filter((approval) => !approval.mine);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Design, development, QA, merchant and deployment sign-off across every project. Each checkpoint is decided by one side of the table."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Waiting on you"
          value={mine.length}
          detail="Checkpoints your role decides"
          tone={mine.length === 0 ? 'success' : 'warning'}
        />
        <Stat
          label="Waiting on others"
          value={others.length}
          detail="Visible, but not yours to decide"
          tone="info"
        />
        <Stat
          label="Oldest request"
          value={approvals[0]?.requestedAt ? formatRelative(approvals[0].requestedAt, now) : '-'}
          detail={approvals[0]?.project.merchant.name ?? 'Nothing pending'}
          tone={approvals.length === 0 ? 'success' : 'neutral'}
        />
      </div>

      <ApprovalList
        title="Waiting on you"
        description="Nothing moves until you decide these."
        approvals={mine}
        now={now}
        emphasis
      />
      <ApprovalList
        title="Waiting on someone else"
        description="For visibility. The other side decides these."
        approvals={others}
        now={now}
      />
    </div>
  );
}

function ApprovalList({
  title,
  description,
  approvals,
  now,
  emphasis,
}: {
  title: string;
  description: string;
  approvals: Awaited<ReturnType<typeof listPendingApprovals>>;
  now: Date;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis && approvals.length > 0 ? 'border-warning/40' : undefined}>
      <CardHeader title={title} count={approvals.length} description={description} />
      {approvals.length === 0 ? (
        <Empty title="Nothing pending" className="py-10" />
      ) : (
        <ul className="divide-line divide-y">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <Link
                href={`/projects/${approval.project.code}/approvals`}
                className="hover:bg-surface-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 transition-colors"
              >
                <div className="min-w-[14rem] flex-1">
                  <ProjectLink
                    code={approval.project.code}
                    name={approval.project.merchant.name}
                    linked={false}
                  />
                </div>
                <Badge tone={APPROVAL_TYPE_LABEL[approval.type].tone} size="md">
                  {APPROVAL_TYPE_LABEL[approval.type].label}
                </Badge>
                <StagePill stage={approval.project.stage} size="sm" />
                <HealthPill health={approval.project.health} size="sm" />
                <p className="text-muted min-w-[12rem] flex-1 truncate text-[12.5px]">
                  {approval.notes ?? 'No notes attached'}
                </p>
                <span className="text-faint shrink-0 text-[11.5px]">
                  {approval.requestedAt ? formatRelative(approval.requestedAt, now) : 'not dated'}
                  {approval.requestedBy && ` - ${approval.requestedBy.name}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
