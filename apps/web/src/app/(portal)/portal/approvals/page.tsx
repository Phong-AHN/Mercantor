import type { Metadata } from 'next';
import {
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
  formatDateTime,
  type ApprovalType,
} from '@relay/core';
import { canDecideApproval } from '@relay/rbac';
import { Alert, Card, CardBody, CardHeader, StatusPill } from '@relay/ui';
import { ApprovalControls } from '@/app/(app)/projects/[code]/approvals/approval-controls';
import { getPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

/**
 * The natural order work actually happens in - design, then development,
 * then QA, then the merchant's own sign-off, then SHOPLINE deploying it live.
 * One ordered pipeline reads as "how far along is this", which a merchant's
 * own status card and an unordered "everything else" list did not.
 */
const PIPELINE_ORDER: ApprovalType[] = [
  'DESIGN',
  'DEVELOPMENT',
  'QA',
  'MERCHANT_FINAL',
  'SHOPLINE_DEPLOYMENT',
];

const PIPELINE_DESCRIPTION: Record<ApprovalType, string> = {
  DESIGN: 'AHN signs this off once the design work is ready to build against.',
  DEVELOPMENT: "AHN's internal check that the build matches the design.",
  QA: 'AHN and SHOPLINE both check the migrated store before it goes to you.',
  MERCHANT_FINAL: 'Your sign-off that the store is ready to go live.',
  SHOPLINE_DEPLOYMENT: 'SHOPLINE clears the store to actually go live, after your approval.',
};

export default async function PortalApprovalsPage() {
  const principal = await requirePrincipalOrRedirect('/portal/approvals');
  const project = await getPortalProject(principal);

  const byType = new Map(project.approvals.map((approval) => [approval.type, approval]));
  const mine = byType.get('MERCHANT_FINAL');
  const pending = mine?.status === 'PENDING';
  const live = byType.get('SHOPLINE_DEPLOYMENT')?.status === 'APPROVED';

  return (
    <div className="space-y-4">
      {pending ? (
        <Alert tone="warning" title="Your approval is needed">
          AHN has asked you to sign off. Nothing goes live until you do.
        </Alert>
      ) : live ? (
        <Alert tone="success" title="Your store is live">
          SHOPLINE has deployed it. Every step below is complete.
        </Alert>
      ) : (
        <Alert tone="info" dense>
          You will be asked to approve the finished store before it goes live. Approvals are
          recorded with your name and the moment you gave them.
        </Alert>
      )}

      {mine && (
        <Card className={mine.status === 'PENDING' ? 'border-warning/40' : undefined}>
          <CardHeader
            title={APPROVAL_TYPE_LABEL.MERCHANT_FINAL.label}
            description={PIPELINE_DESCRIPTION.MERCHANT_FINAL}
            actions={<StatusPill descriptor={APPROVAL_STATUS_LABEL[mine.status]} />}
          />
          <CardBody className="space-y-3">
            {mine.notes && (
              <p className="bg-surface-2 text-ink-soft rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] leading-5">
                {mine.notes}
              </p>
            )}
            {mine.decidedAt && (
              <p className="text-muted text-[12px]">
                Decided {formatDateTime(mine.decidedAt)}
                {mine.decidedBy && ` by ${mine.decidedBy.name}`}
              </p>
            )}
            <ApprovalControls
              code={project.code}
              type="MERCHANT_FINAL"
              status={mine.status}
              canRequest={false}
              canDecide={canDecideApproval(principal, 'MERCHANT_FINAL')}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="The full approval pipeline"
          description="Every checkpoint between the design and your store going live, in order."
        />
        <CardBody className="p-0">
          <ol className="divide-line divide-y">
            {PIPELINE_ORDER.map((type, index) => {
              const approval = byType.get(type);
              const status = approval?.status ?? 'NOT_REQUESTED';
              const isMerchantOwn = type === 'MERCHANT_FINAL';
              return (
                <li key={type} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={
                      status === 'APPROVED'
                        ? 'bg-success text-success-ink flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'
                        : 'bg-surface-2 text-muted flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'
                    }
                  >
                    {status === 'APPROVED' ? '✓' : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink text-[13px] font-medium">
                        {isMerchantOwn ? 'Your approval' : APPROVAL_TYPE_LABEL[type].label}
                      </span>
                      <StatusPill descriptor={APPROVAL_STATUS_LABEL[status]} size="sm" />
                    </div>
                    <p className="text-muted mt-0.5 text-[12px] leading-5">
                      {PIPELINE_DESCRIPTION[type]}
                    </p>
                    {approval?.decidedAt && (
                      <p className="text-faint mt-1 text-[11.5px]">
                        {formatDateTime(approval.decidedAt)}
                        {approval.decidedBy && ` — ${approval.decidedBy.name}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
