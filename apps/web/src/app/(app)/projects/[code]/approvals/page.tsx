import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
  APPROVAL_TYPES,
  formatDateTime,
} from '@relay/core';
import { can, canDecideApproval } from '@relay/rbac';
import { Alert, Card, CardBody, CardHeader, StatusPill } from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { ApprovalControls } from './approval-controls';

export const dynamic = 'force-dynamic';

const WHO_DECIDES: Record<(typeof APPROVAL_TYPES)[number], string> = {
  DESIGN: 'AHN records it once the merchant has signed off the design.',
  DEVELOPMENT: 'AHN confirms the build matches the approved design and scope.',
  QA: 'AHN confirms the internal quality pass has been completed.',
  MERCHANT_FINAL: 'The merchant gives final approval to go live.',
  SHOPLINE_DEPLOYMENT: 'SHOPLINE approves deployment after reviewing the handoff package.',
};

/**
 * Formal, timestamped checkpoints - the point of the page is that an approval
 * has a name against it and a moment it happened, rather than living in an
 * email thread somebody has to go and find.
 */
export default async function ProjectApprovalsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/approvals`);
  const project = await getProject(principal, code);
  const canRequest = can(principal, 'approval:request');

  const outstanding = APPROVAL_TYPES.filter((type) => {
    const approval = project.approvals.find((item) => item.type === type);
    return (approval?.status ?? 'NOT_REQUESTED') !== 'APPROVED';
  });

  return (
    <div className="space-y-4">
      {outstanding.length === 0 ? (
        <Alert tone="success" title="Every checkpoint is signed off">
          Design, development, QA, the merchant and SHOPLINE have all approved.
        </Alert>
      ) : (
        <Alert tone="info" title={`${outstanding.length} checkpoint(s) still open`}>
          {outstanding.map((type) => APPROVAL_TYPE_LABEL[type].label).join(', ')}.
        </Alert>
      )}

      <div className="grid gap-3">
        {APPROVAL_TYPES.map((type) => {
          const approval = project.approvals.find((item) => item.type === type);
          const status = approval?.status ?? 'NOT_REQUESTED';
          const decide = canDecideApproval(principal, type);

          return (
            <Card key={type}>
              <CardHeader
                title={APPROVAL_TYPE_LABEL[type].label}
                description={WHO_DECIDES[type]}
                actions={<StatusPill descriptor={APPROVAL_STATUS_LABEL[status]} />}
              />
              <CardBody className="space-y-3">
                <dl className="grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Requested</dt>
                    <dd className="text-ink-soft text-right">
                      {approval?.requestedAt ? (
                        <>
                          {formatDateTime(approval.requestedAt)}
                          <span className="text-faint block text-[11px]">
                            {approval.requestedBy
                              ? `by ${approval.requestedBy.name}`
                              : 'automatically'}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">Not requested</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Decided</dt>
                    <dd className="text-ink-soft text-right">
                      {approval?.decidedAt ? (
                        <>
                          {formatDateTime(approval.decidedAt)}
                          {approval.decidedBy && (
                            <span className="text-faint block text-[11px]">
                              by {approval.decidedBy.name}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint">Pending</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {approval?.notes && (
                  <p className="bg-surface-2 text-ink-soft rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] leading-5">
                    {approval.notes}
                  </p>
                )}

                {(canRequest || decide) && (
                  <ApprovalControls
                    code={project.code}
                    type={type}
                    status={status}
                    canRequest={canRequest}
                    canDecide={decide}
                  />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
