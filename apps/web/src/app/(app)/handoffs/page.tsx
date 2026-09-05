import type { Metadata } from 'next';
import Link from 'next/link';
import { clock, formatDateTime, formatDuration, HANDOFF_DECISION_LABEL } from '@relay/core';
import { can } from '@relay/rbac';
import { Card, CardHeader, Empty, PageHeader, PermissionDenied, Stat, StatusPill } from '@relay/ui';
import { HealthPill, ProjectLink, StagePill } from '@/components/domain';
import { listHandoffs } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'SHOPLINE review' };
export const dynamic = 'force-dynamic';

/**
 * The SHOPLINE side of the handshake. Pending packages first, because a
 * migration sitting in review is a migration nobody is working on.
 */
export default async function HandoffsPage() {
  const principal = await requirePrincipalOrRedirect('/handoffs');
  if (!can(principal, 'handoff:decide') && !can(principal, 'handoff:submit')) {
    return <PermissionDenied />;
  }

  const handoffs = await listHandoffs(principal);
  const now = clock.now();
  const pending = handoffs.filter((handoff) => handoff.decision === 'PENDING');
  const decided = handoffs.filter((handoff) => handoff.decision !== 'PENDING');

  const oldestWait = pending[pending.length - 1];
  const approved = decided.filter((handoff) => handoff.decision === 'APPROVED').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="SHOPLINE review"
        description="Packages AHN has submitted for deployment approval, and what SHOPLINE decided."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Awaiting a decision"
          value={pending.length}
          detail={pending.length === 0 ? 'Nothing in the queue' : 'Blocking a launch'}
          tone={pending.length === 0 ? 'success' : 'warning'}
        />
        <Stat
          label="Longest wait"
          value={
            oldestWait
              ? formatDuration(now.getTime() - oldestWait.submittedAt.getTime(), {
                  compact: true,
                })
              : '-'
          }
          detail={oldestWait?.project.merchant.name ?? 'Nothing waiting'}
          tone={oldestWait ? 'danger' : 'success'}
        />
        <Stat
          label="Approved"
          value={approved}
          detail={`${decided.length} decision(s) recorded`}
          tone="success"
        />
      </div>

      <Card className={pending.length > 0 ? 'border-warning/40' : undefined}>
        <CardHeader
          title="Awaiting SHOPLINE"
          count={pending.length}
          description="Approve deployment, request changes, or report an issue - from the project's handoff tab."
        />
        {pending.length === 0 ? (
          <Empty title="Nothing waiting on SHOPLINE" className="py-12" />
        ) : (
          <ul className="divide-line divide-y">
            {pending.map((handoff) => (
              <li key={handoff.id}>
                <Link
                  href={`/projects/${handoff.project.code}/handoff`}
                  className="hover:bg-surface-2 block px-5 py-4 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                    <div className="min-w-[14rem] flex-1">
                      <ProjectLink
                        code={handoff.project.code}
                        name={handoff.project.merchant.name}
                        linked={false}
                      />
                    </div>
                    <StagePill stage={handoff.project.stage} size="sm" />
                    <HealthPill health={handoff.project.health} size="sm" />
                    <span className="tabular text-warning-ink text-[12.5px] font-medium">
                      waiting{' '}
                      {formatDuration(now.getTime() - handoff.submittedAt.getTime(), {
                        compact: true,
                      })}
                    </span>
                    <span className="text-faint text-[11.5px]">
                      submitted by {handoff.submittedBy.name}
                    </span>
                  </div>
                  {handoff.deploymentNotes && (
                    <p className="text-muted mt-2 line-clamp-2 text-[12.5px]">
                      {handoff.deploymentNotes}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Decided" count={decided.length} />
        {decided.length === 0 ? (
          <Empty title="No decisions yet" className="py-10" />
        ) : (
          <ul className="divide-line divide-y">
            {decided.map((handoff) => (
              <li key={handoff.id}>
                <Link
                  href={`/projects/${handoff.project.code}/handoff`}
                  className="hover:bg-surface-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 transition-colors"
                >
                  <div className="min-w-[14rem] flex-1">
                    <ProjectLink
                      code={handoff.project.code}
                      name={handoff.project.merchant.name}
                      linked={false}
                    />
                  </div>
                  <StatusPill descriptor={HANDOFF_DECISION_LABEL[handoff.decision]} size="sm" />
                  <p className="text-muted min-w-[12rem] flex-1 truncate text-[12.5px]">
                    {handoff.decisionNotes ?? 'No notes'}
                  </p>
                  <span className="text-faint shrink-0 text-[11.5px]">
                    {handoff.decidedAt ? formatDateTime(handoff.decidedAt) : ''}
                    {handoff.decidedBy && ` - ${handoff.decidedBy.name}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
