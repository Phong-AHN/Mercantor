import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  clock,
  FINDING_CATEGORY_LABEL,
  FINDING_SEVERITY_LABEL,
  FINDING_SOURCE_LABEL,
  FINDING_STATUS_LABEL,
  formatDateTime,
  formatRelative,
  PAGE_TYPE_LABEL,
  USER_ROLE_LABEL,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DetailList,
  DetailRow,
  Mono,
  StatusPill,
} from '@relay/ui';
import {
  FalsePositiveButton,
  FindingCommentForm,
  FindingMeta,
  FindingWorkflow,
  ShareFindingsButton,
} from '@/components/qa/finding-controls';
import { listAssignableUsers } from '@/features/projects/queries';
import { getFinding } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  severity: 'Severity',
  assignee: 'Assignee',
  clientVisible: 'Client visibility',
  falsePositive: 'False positive',
  verification: 'Verification',
};

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ code: string; reference: string }>;
}) {
  const { code, reference } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa/findings/${reference}`);
  const [result, people] = await Promise.all([
    getFinding(principal, code, decodeURIComponent(reference)),
    listAssignableUsers(principal.organizationId),
  ]);
  if (!result) notFound();
  const { finding } = result;
  const now = clock.now();
  const canManage = can(principal, 'finding:manage');
  const canApprove = can(principal, 'finding:approve');
  const canComment = can(principal, 'comment:create');
  const peopleNames = new Map(people.all.map((person) => [person.id, person.name]));
  const shared = !!finding.clientVisibleAt;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${code}/qa/findings`}
        className="text-muted hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft className="size-3.5" />
        All findings
      </Link>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Mono>{finding.reference}</Mono>
                <StatusPill descriptor={FINDING_STATUS_LABEL[finding.status]} />
                <StatusPill descriptor={FINDING_SEVERITY_LABEL[finding.severity]} />
                <Badge tone="neutral" variant="outline">
                  {FINDING_CATEGORY_LABEL[finding.category].label}
                </Badge>
                {shared ? (
                  <Badge tone="accent">Shared with client</Badge>
                ) : (
                  <Badge tone="muted">Internal</Badge>
                )}
                {finding.falsePositive && <Badge tone="muted">False positive</Badge>}
              </div>
              <h1 className="text-ink text-[20px] font-semibold leading-tight tracking-tight [text-wrap:balance]">
                {finding.title}
              </h1>
              <a
                href={finding.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-ink inline-flex max-w-full items-center gap-1 break-all font-mono text-[12.5px] underline-offset-4 hover:underline"
              >
                {finding.url}
                <ExternalLink className="size-3 shrink-0" />
              </a>

              {finding.evidenceText && (
                <section>
                  <h2 className="text-muted mb-1 text-[11.5px] font-semibold uppercase tracking-wide">
                    Evidence
                  </h2>
                  <blockquote className="border-line bg-surface-2 text-ink whitespace-pre-wrap rounded-[var(--radius-md)] border px-4 py-3 text-[13.5px] leading-relaxed">
                    {finding.evidenceText}
                  </blockquote>
                </section>
              )}
              {finding.suggestion && (
                <section>
                  <h2 className="text-muted mb-1 text-[11.5px] font-semibold uppercase tracking-wide">
                    Suggested correction
                  </h2>
                  <p className="text-ink text-[13.5px]">{finding.suggestion}</p>
                </section>
              )}
              {finding.recommendation && (
                <section>
                  <h2 className="text-muted mb-1 text-[11.5px] font-semibold uppercase tracking-wide">
                    Recommended action
                  </h2>
                  <p className="text-ink text-[13.5px]">{finding.recommendation}</p>
                </section>
              )}
              {finding.falsePositiveReason && (
                <p className="text-muted text-[12.5px]">Not a problem: {finding.falsePositiveReason}</p>
              )}
              {finding.verificationNote && (
                <p className="text-success-ink text-[12.5px]">Verified: {finding.verificationNote}</p>
              )}

              {canManage && (
                <div className="border-line space-y-3 border-t pt-4">
                  <FindingWorkflow code={code} findingId={finding.id} status={finding.status} />
                  {finding.status === 'READY_FOR_VERIFICATION' && finding.verificationResult && (
                    <p className="text-muted text-[12.5px]">
                      Last re-check:{' '}
                      {finding.verificationResult === 'PASSED'
                        ? 'no longer detected.'
                        : 'still present on the page.'}
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversation" count={finding.comments.length} />
            <CardBody className="space-y-4">
              {finding.comments.length === 0 ? (
                <p className="text-muted text-[13px]">No comments yet.</p>
              ) : (
                <ol className="space-y-4">
                  {finding.comments.map((comment) => (
                    <li key={comment.id} className="flex gap-3">
                      <div className="bg-surface-2 text-ink grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
                        {comment.author.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-[12px]">
                          <span className="text-ink font-semibold">{comment.author.name}</span>
                          <span className="text-muted">{USER_ROLE_LABEL[comment.author.role].label}</span>
                          <span className="text-faint">
                            {formatDateTime(comment.createdAt)} ({formatRelative(comment.createdAt, now)})
                          </span>
                          {!comment.clientVisible && <Badge tone="muted" size="sm">Internal</Badge>}
                        </p>
                        <p className="text-ink mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed">
                          {comment.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {canComment && (
                <FindingCommentForm code={code} findingId={finding.id} canChooseVisibility shared={shared} />
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              {canManage ? (
                <FindingMeta
                  code={code}
                  findingId={finding.id}
                  severity={finding.severity}
                  assigneeId={finding.assigneeId}
                  people={people.all.map((person) => ({ id: person.id, name: person.name }))}
                />
              ) : null}
              <DetailList>
                <DetailRow label="Page type">{PAGE_TYPE_LABEL[finding.pageType].label}</DetailRow>
                <DetailRow label="Source">{FINDING_SOURCE_LABEL[finding.source].label}</DetailRow>
                {finding.source !== 'MANUAL' && <DetailRow label="Rule">{finding.detector}</DetailRow>}
                <DetailRow label="First found">{formatDateTime(finding.firstSeenAt)}</DetailRow>
                <DetailRow label="Last seen">{formatRelative(finding.lastSeenAt, now)}</DetailRow>
                {finding.occurrences > 1 && (
                  <DetailRow label="Seen">{finding.occurrences} checks</DetailRow>
                )}
                {finding.reviewedBy && finding.reviewedAt && (
                  <DetailRow label="Reviewed">
                    {finding.reviewedBy.name}, {formatRelative(finding.reviewedAt, now)}
                  </DetailRow>
                )}
                {!canManage && <DetailRow label="Assignee">{finding.assignee?.name ?? 'Unassigned'}</DetailRow>}
              </DetailList>
              {(canApprove || canManage) && (
                <div className="flex flex-wrap gap-2">
                  {canApprove && !finding.falsePositive && (
                    <ShareFindingsButton code={code} findingIds={[finding.id]} visible={!shared} />
                  )}
                  {canManage && !finding.falsePositive && (
                    <FalsePositiveButton code={code} findingId={finding.id} />
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {finding.events && finding.events.length > 0 && (
            <Card>
              <CardHeader title="History" />
              <CardBody>
                <ol className="space-y-3">
                  {finding.events.map((event) => {
                    const describe = (value: string | null) =>
                      event.field === 'assignee'
                        ? value
                          ? (peopleNames.get(value) ?? 'someone')
                          : 'nobody'
                        : event.field === 'status' || event.field === 'falsePositive'
                          ? value && value in FINDING_STATUS_LABEL
                            ? FINDING_STATUS_LABEL[value as keyof typeof FINDING_STATUS_LABEL].label
                            : value
                          : value;
                    return (
                      <li key={event.id} className="text-[12.5px] leading-5">
                        <p className="text-ink">
                          <span className="font-medium">{FIELD_LABEL[event.field] ?? event.field}</span>
                          {event.fromValue ? ` ${describe(event.fromValue)} →` : ''}{' '}
                          {describe(event.toValue)}
                        </p>
                        {event.note && <p className="text-muted">{event.note}</p>}
                        <p className="text-faint text-[11.5px]">
                          {event.actor?.name ?? 'Automated check'} · {formatRelative(event.createdAt, now)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
