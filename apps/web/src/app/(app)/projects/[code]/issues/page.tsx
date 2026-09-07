import {
  formatDate,
  formatRelative,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  TEAM_LABEL,
} from '@relay/core';
import { can } from '@relay/rbac';
import { Alert, Card, CardBody, CardHeader, Empty, Mono, Stat, StatusPill } from '@relay/ui';
import { FileUploadButton } from '@/app/(app)/projects/[code]/access/access-controls';
import { DueDate } from '@/components/domain';
import { getProject, listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import {
  CreateClickUpTaskButton,
  IssueControls,
  ReportIssueButton,
  ViewClickUpTaskLink,
} from './issue-controls';

export const dynamic = 'force-dynamic';

const OPEN = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_OTHERS'];

export default async function ProjectIssuesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/issues`);
  const [project, people] = await Promise.all([
    getProject(principal, code),
    listAssignableUsers(principal.organizationId),
  ]);

  const now = project.snapshot.time.now;
  const canReport = can(principal, 'issue:create');
  const canManage = can(principal, 'issue:manage');
  const canUploadFiles = can(principal, 'asset:upload');
  const assignees = people.all.map((person) => ({ id: person.id, name: person.name }));

  const open = project.issues.filter((issue) => OPEN.includes(issue.status));
  const closed = project.issues.filter((issue) => !OPEN.includes(issue.status));
  const launchBlockers = open.filter((issue) => issue.severity === 'LAUNCH_BLOCKER');

  return (
    <div className="space-y-4">
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
                detail={count === 0 ? 'None open' : 'Open'}
                tone={count === 0 ? 'success' : ISSUE_SEVERITY_LABEL[severity].tone}
              />
            );
          })}
      </div>

      {launchBlockers.length > 0 && (
        <Alert tone="danger" title={`${launchBlockers.length} launch blocker(s) open`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {launchBlockers.map((issue) => (
              <li key={issue.id}>
                {issue.reference} - {issue.title}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Open issues"
          count={open.length}
          description="Severity decides urgency; a launch blocker changes the project's health on its own."
          actions={canReport ? <ReportIssueButton code={project.code} people={assignees} /> : null}
        />
        {open.length === 0 ? (
          <Empty
            title="No open issues"
            description="Nothing is currently escalated on this project."
            className="py-12"
          />
        ) : (
          <ul className="divide-line divide-y">
            {open.map((issue) => (
              <li key={issue.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-[18rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono>{issue.reference}</Mono>
                      <StatusPill descriptor={ISSUE_SEVERITY_LABEL[issue.severity]} size="sm" />
                      <StatusPill descriptor={ISSUE_STATUS_LABEL[issue.status]} size="sm" />
                    </div>
                    <p className="text-ink mt-1.5 text-[14px] font-semibold leading-5">
                      {issue.title}
                    </p>
                    <p className="text-muted mt-1 whitespace-pre-wrap text-[13px] leading-5">
                      {issue.description}
                    </p>
                    <p className="text-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                      <span>
                        reported by {issue.reportedBy?.name ?? 'unknown'}{' '}
                        {formatRelative(issue.reportedAt, now)}
                      </span>
                      <span>owner: {issue.owner?.name ?? TEAM_LABEL[issue.ownerTeam].label}</span>
                      {issue.dueDate && (
                        <span>
                          due <DueDate date={issue.dueDate} now={now} />
                        </span>
                      )}
                    </p>
                    {issue.attachments.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-2">
                        {issue.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="bg-surface-2 text-accent-ink rounded-full px-2 py-0.5 text-[11.5px] underline-offset-4 hover:underline"
                            >
                              {attachment.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canUploadFiles && (canManage || issue.reportedBy?.id === principal.id) && (
                      <div className="mt-1.5">
                        <FileUploadButton code={project.code} issueId={issue.id} />
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <IssueControls
                        code={project.code}
                        issueId={issue.id}
                        reference={issue.reference}
                        status={issue.status}
                        severity={issue.severity}
                        ownerTeam={issue.ownerTeam}
                        people={assignees}
                      />
                      {issue.clickUpTaskUrl ? (
                        <ViewClickUpTaskLink url={issue.clickUpTaskUrl} />
                      ) : (
                        <CreateClickUpTaskButton code={project.code} issueId={issue.id} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Closed"
          count={closed.length}
          description="Kept with their resolutions, because the same problem tends to come back."
        />
        <CardBody>
          {closed.length === 0 ? (
            <Empty title="Nothing closed yet" className="py-6" />
          ) : (
            <ul className="space-y-3">
              {closed.map((issue) => (
                <li key={issue.id} className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink flex items-center gap-2 text-[13px] font-medium">
                      <Mono>{issue.reference}</Mono>
                      {issue.title}
                    </p>
                    {issue.resolution && (
                      <p className="text-muted mt-0.5 text-[12.5px]">{issue.resolution}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusPill descriptor={ISSUE_STATUS_LABEL[issue.status]} size="sm" />
                    {issue.resolvedAt && (
                      <p className="text-faint mt-1 text-[11px]">{formatDate(issue.resolvedAt)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
