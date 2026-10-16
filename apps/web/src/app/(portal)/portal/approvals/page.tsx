import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, CircleDot, ExternalLink, TriangleAlert } from 'lucide-react';
import { formatDateTime, type ApprovalStatus, type ApprovalType } from '@relay/core';
import { db } from '@relay/db';
import { canDecideApproval } from '@relay/rbac';
import { Alert, Badge, Card, CardBody, CardHeader, cn } from '@relay/ui';
import { ApprovalControls } from '@/app/(app)/projects/[code]/approvals/approval-controls';
import { findPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { NoPortalProject } from '../no-project';

export const metadata: Metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

/**
 * The three moments that are the merchant's to see, in order. The team's own
 * checkpoints (AHN's build review, SHOPLINE's deployment check) happen
 * between them and are not the merchant's to follow step by step.
 */
const MERCHANT_STEPS: { type: ApprovalType; title: string; description: string }[] = [
  {
    type: 'DESIGN',
    title: 'Design',
    description: 'How your new store looks, agreed before we build it.',
  },
  {
    type: 'QA',
    title: 'Store testing',
    description: 'We test every page, the cart and checkout before you try it.',
  },
  {
    type: 'MERCHANT_FINAL',
    title: 'Go-live sign-off',
    description:
      'You confirm the store is ready. After that, SHOPLINE does a last check and it goes live.',
  },
];

function stepState(
  type: ApprovalType,
  status: ApprovalStatus,
): { label: string; tone: 'success' | 'warning' | 'muted' | 'danger' } {
  if (status === 'APPROVED') return { label: 'Done', tone: 'success' };
  if (status === 'CHANGES_REQUESTED' || status === 'REJECTED')
    return { label: 'Changes asked for', tone: 'danger' };
  if (status === 'PENDING') {
    return type === 'MERCHANT_FINAL'
      ? { label: 'Waiting on you', tone: 'warning' }
      : { label: 'In progress', tone: 'warning' };
  }
  return { label: 'Not yet', tone: 'muted' };
}

export default async function PortalApprovalsPage() {
  const principal = await requirePrincipalOrRedirect('/portal/approvals');
  const project = await findPortalProject(principal);
  if (!project) return <NoPortalProject />;

  const byType = new Map(project.approvals.map((approval) => [approval.type, approval]));
  const mine = byType.get('MERCHANT_FINAL');
  const pending = mine?.status === 'PENDING';
  const live = byType.get('SHOPLINE_DEPLOYMENT')?.status === 'APPROVED';

  // What the merchant is signing off, next to the button: anything still
  // open, and the new store itself when the team has shared it.
  const openIssues = project.issues.filter(
    (issue) => !['RESOLVED', 'WONT_FIX'].includes(issue.status),
  );
  const launchBlockers = openIssues.filter((issue) => issue.severity === 'LAUNCH_BLOCKER');
  const storefront = await db.storefrontProfile.findUnique({
    where: { projectId: project.id },
    select: { destinationUrl: true, publishedAt: true },
  });
  const previewUrl = storefront?.publishedAt ? storefront.destinationUrl : null;

  return (
    <div className="space-y-4">
      {pending ? (
        <Alert tone="warning" title="Your sign-off is the last step before launch">
          Once you approve, SHOPLINE does a final check and your new store goes live. Anything you
          spot after launch is still fixed - just tell us in Conversation.
        </Alert>
      ) : live ? (
        <Alert tone="success" title="Your store is live">
          Every step below is done. Anything you spot is still fixed - just tell us in Conversation.
        </Alert>
      ) : (
        <Alert tone="info" title="Nothing is waiting on you here">
          We will ask for your sign-off once your new store has been tested. Until then there is
          nothing to approve.
        </Alert>
      )}

      {mine && pending && (
        <Card className="border-warning/40">
          <CardHeader
            title="Go-live sign-off"
            description="Check your new store, then approve it - or tell us what to change first."
          />
          <CardBody className="space-y-4">
            <ul className="grid gap-2 sm:grid-cols-3">
              <li className="bg-surface-2 rounded-[var(--radius-sm)] px-3 py-2.5">
                <p className="text-muted text-[11.5px]">Open issues</p>
                <p className="text-ink mt-0.5 text-[15px] font-semibold">
                  {openIssues.length === 0 ? 'None' : openIssues.length}
                </p>
              </li>
              <li className="bg-surface-2 rounded-[var(--radius-sm)] px-3 py-2.5">
                <p className="text-muted text-[11.5px]">Blocking launch</p>
                <p
                  className={cn(
                    'mt-0.5 text-[15px] font-semibold',
                    launchBlockers.length > 0 ? 'text-danger-ink' : 'text-ink',
                  )}
                >
                  {launchBlockers.length === 0 ? 'Nothing' : launchBlockers.length}
                </p>
              </li>
              <li className="bg-surface-2 rounded-[var(--radius-sm)] px-3 py-2.5">
                <p className="text-muted text-[11.5px]">Your new store</p>
                {previewUrl ? (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent-ink mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium underline-offset-4 hover:underline"
                  >
                    Open the preview
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <Link
                    href="/portal/qa"
                    className="text-accent-ink mt-0.5 inline-block text-[13px] font-medium underline-offset-4 hover:underline"
                  >
                    See the site review
                  </Link>
                )}
              </li>
            </ul>
            {launchBlockers.length > 0 && (
              <p className="text-danger-ink flex items-start gap-2 text-[12.5px]">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Something is still blocking launch. You can approve, but you may prefer to wait
                until your team has fixed it.
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
        <CardHeader title="Your sign-offs" description="The three moments you approve, in order." />
        <CardBody className="p-0">
          <ol className="divide-line divide-y">
            {MERCHANT_STEPS.map((step) => {
              const approval = byType.get(step.type);
              const status = approval?.status ?? 'NOT_REQUESTED';
              const state = stepState(step.type, status);
              return (
                <li key={step.type} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={cn(
                      'mt-0.5 shrink-0',
                      status === 'APPROVED' ? 'text-success-ink' : 'text-faint',
                    )}
                  >
                    {status === 'APPROVED' ? (
                      <CircleCheck className="size-5" />
                    ) : (
                      <CircleDot className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink text-[13.5px] font-medium">{step.title}</span>
                      <Badge tone={state.tone} size="sm">
                        {state.label}
                      </Badge>
                    </div>
                    <p className="text-muted mt-0.5 text-[12.5px] leading-5">{step.description}</p>
                    {approval?.decidedAt && status === 'APPROVED' && (
                      <p className="text-faint mt-1 text-[11.5px]">
                        {formatDateTime(approval.decidedAt)}
                        {approval.decidedBy && ` - ${approval.decidedBy.name}`}
                      </p>
                    )}
                    {approval?.notes && status !== 'APPROVED' && (
                      <p className="bg-surface-2 text-ink-soft mt-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] leading-5">
                        {approval.notes}
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
