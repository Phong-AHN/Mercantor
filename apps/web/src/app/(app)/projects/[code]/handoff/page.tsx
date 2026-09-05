import { CircleCheck, CircleX } from 'lucide-react';
import { APPROVAL_TYPE_LABEL, formatDateTime, HANDOFF_DECISION_LABEL, STAGES } from '@relay/core';
import { can } from '@relay/rbac';
import { Alert, Badge, Card, CardBody, CardHeader, cn, Empty, StatusPill } from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { unmetHandoffRequirements } from '@/features/projects/mutations';
import { requirePrincipalOrRedirect } from '@/server/session';
import { HandoffDecisionControls } from './handoff-controls';

export const dynamic = 'force-dynamic';

/**
 * The handoff. Everything the brief asks to be verified before submission is
 * computed here and shown as a checklist, so the button being disabled is
 * explained rather than mysterious.
 */
export default async function ProjectHandoffPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/handoff`);
  const project = await getProject(principal, code);
  const unmet = await unmetHandoffRequirements(project.id);

  const canDecide = can(principal, 'handoff:decide');
  const latest = project.handoffs[0];
  const pending = latest && latest.decision === 'PENDING' ? latest : null;

  const checks = [
    {
      label: 'Migration complete and validated',
      met: !unmet.some((item) => item.includes('scope')),
      detail: `${project.scopeItems.filter((item) => item.status === 'VERIFIED').length} of ${
        project.scopeItems.filter((item) => item.disposition === 'IN_SCOPE').length
      } in-scope data sets verified`,
    },
    {
      label: APPROVAL_TYPE_LABEL.DESIGN.label,
      met: !unmet.includes('Design has not been approved.'),
      detail: 'Merchant has signed off the design',
    },
    {
      label: APPROVAL_TYPE_LABEL.DEVELOPMENT.label,
      met: !unmet.includes('Development has not been approved.'),
      detail: 'Build matches the approved design and scope',
    },
    {
      label: APPROVAL_TYPE_LABEL.QA.label,
      met: !unmet.includes('QA has not been approved.'),
      detail: 'Internal quality pass complete',
    },
    {
      label: APPROVAL_TYPE_LABEL.MERCHANT_FINAL.label,
      met: !unmet.includes('The merchant has not given final approval.'),
      detail: 'Merchant is happy to go live',
    },
    {
      label: 'No open blockers',
      met: !unmet.some((item) => item.includes('blocker(s) still open')),
      detail: `${project.blockers.filter((blocker) => blocker.resolvedAt === null).length} open`,
    },
    {
      label: 'No launch-blocking issues',
      met: !unmet.some((item) => item.includes('launch-blocking')),
      detail: `${project.snapshot.launchBlockerCount} open`,
    },
    {
      label: 'Blocking access verified',
      met: !unmet.some((item) => item.includes('blocking access')),
      detail: `${project.accessItems.filter((item) => item.blocking && item.status === 'VERIFIED').length} of ${
        project.accessItems.filter((item) => item.blocking).length
      } verified`,
    },
    {
      label: 'Required assets received',
      met: !unmet.some((item) => item.includes('required asset')),
      detail: `${project.assetItems.filter((item) => item.required && item.status === 'APPROVED').length} of ${
        project.assetItems.filter((item) => item.required).length
      } approved`,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Deployment readiness"
            description="Checked on the server every time somebody presses Submit to SHOPLINE - this panel is the same computation, shown early."
            actions={
              unmet.length === 0 ? (
                <Badge tone="success" dot>
                  Ready
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  {unmet.length} outstanding
                </Badge>
              )
            }
          />
          <CardBody>
            <ul className="space-y-2.5">
              {checks.map((check) => (
                <li key={check.label} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                      check.met
                        ? 'bg-success-soft text-success-ink'
                        : 'bg-warning-soft text-warning-ink',
                    )}
                  >
                    {check.met ? (
                      <CircleCheck className="size-3.5" />
                    ) : (
                      <CircleX className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-[13px] leading-5',
                        check.met ? 'text-ink' : 'text-warning-ink font-medium',
                      )}
                    >
                      {check.label}
                    </span>
                    <span className="text-muted block text-[11.5px]">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {project.deploymentNotes && (
          <Card>
            <CardHeader title="Deployment notes" description="The plan AHN submitted." />
            <CardBody>
              <p className="text-ink-soft whitespace-pre-wrap text-[13px] leading-6">
                {project.deploymentNotes}
              </p>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {pending && canDecide && (
          <Card className="border-info/40">
            <CardHeader
              title="SHOPLINE decision"
              description={`Submitted by ${pending.submittedBy.name} on ${formatDateTime(pending.submittedAt)}.`}
            />
            <CardBody>
              <HandoffDecisionControls code={project.code} handoffId={pending.id} />
            </CardBody>
          </Card>
        )}

        {pending && !canDecide && (
          <Alert tone="info" title="With SHOPLINE">
            Submitted {formatDateTime(pending.submittedAt)}. Waiting on a deployment decision.
          </Alert>
        )}

        <Card>
          <CardHeader
            title="Submission history"
            count={project.handoffs.length}
            description="Every package sent to SHOPLINE, with the checklist as it stood at the time."
          />
          {project.handoffs.length === 0 ? (
            <Empty
              title="Never submitted"
              description={`This project is at ${STAGES[project.stage].label}.`}
              className="py-10"
            />
          ) : (
            <ul className="divide-line divide-y">
              {project.handoffs.map((handoff) => (
                <li key={handoff.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink text-[13px] font-medium">
                        Submitted by {handoff.submittedBy.name}
                      </p>
                      <p className="text-faint text-[11.5px]">
                        {formatDateTime(handoff.submittedAt)}
                      </p>
                    </div>
                    <StatusPill descriptor={HANDOFF_DECISION_LABEL[handoff.decision]} size="sm" />
                  </div>

                  {handoff.deploymentNotes && (
                    <p className="bg-surface-2 text-ink-soft mt-2 rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] leading-5">
                      {handoff.deploymentNotes}
                    </p>
                  )}

                  {handoff.decidedAt && (
                    <p className="text-muted mt-2 text-[12px]">
                      {handoff.decidedBy?.name ?? 'SHOPLINE'} decided{' '}
                      {formatDateTime(handoff.decidedAt)}
                      {handoff.decisionNotes && (
                        <span className="text-ink-soft mt-1 block">{handoff.decisionNotes}</span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
