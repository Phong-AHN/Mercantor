import { INTRO_EMAIL_STATUS_LABEL, formatDateTime } from '@relay/core';
import { can } from '@relay/rbac';
import { Card, CardBody, CardHeader, Empty, PermissionDenied, StatusPill } from '@relay/ui';
import { getProject, listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { AssignmentForm, ProjectDetailsForm } from './settings-forms';

export const dynamic = 'force-dynamic';

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/settings`);

  if (!can(principal, 'project:update')) {
    return <PermissionDenied />;
  }

  const [project, people] = await Promise.all([getProject(principal, code), listAssignableUsers()]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ProjectDetailsForm
        code={project.code}
        migrationType={project.migrationType}
        targetLaunchDate={project.targetLaunchDate?.toISOString() ?? null}
        scopeSummary={project.scopeSummary}
        deploymentNotes={project.deploymentNotes}
        contractTotal={can(principal, 'invoice:manage') ? project.contractTotalMinor / 100 : null}
      />

      {can(principal, 'project:assign') && (
        <AssignmentForm
          code={project.code}
          ahn={people.ahn.map((person) => ({
            id: person.id,
            name: person.name,
            title: person.title,
          }))}
          shopline={people.shopline.map((person) => ({
            id: person.id,
            name: person.name,
            title: person.title,
          }))}
          current={{
            ahnProjectManagerId: project.people.ahnPm?.id ?? null,
            ahnDeveloperId: project.people.ahnDev?.id ?? null,
            shoplineAmId: project.people.shoplineAm?.id ?? null,
            shoplineSeId: project.people.shoplineSe?.id ?? null,
          }}
        />
      )}

      <Card className="lg:col-span-2">
        <CardHeader
          title="Introduction emails"
          count={project.introEmails.length}
          description="Every introduction sent for this merchant, with the body exactly as it went out."
        />
        {project.introEmails.length === 0 ? (
          <Empty
            title="No introduction sent yet"
            description="Use Send introduction in the project header once a SHOPLINE account manager and AHN project manager are assigned."
            className="py-10"
          />
        ) : (
          <ul className="divide-line divide-y">
            {project.introEmails.map((email) => (
              <li key={email.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink text-[13.5px] font-medium">{email.subject}</p>
                    <p className="text-faint mt-0.5 text-[11.5px]">
                      {email.sentAt ? `sent ${formatDateTime(email.sentAt)}` : 'draft'}
                      {email.sentBy && ` by ${email.sentBy.name}`}
                      {email.respondedAt && ` - replied ${formatDateTime(email.respondedAt)}`}
                    </p>
                  </div>
                  <StatusPill descriptor={INTRO_EMAIL_STATUS_LABEL[email.status]} size="sm" />
                </div>

                {email.responseNote && (
                  <p className="text-muted mt-2 text-[12.5px]">{email.responseNote}</p>
                )}

                <details className="mt-2">
                  <summary className="text-accent-ink cursor-pointer text-[12px] underline-offset-4 hover:underline">
                    Show what was sent
                  </summary>
                  <pre className="scrollbar-slim bg-surface-2 text-ink-soft mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] p-3 font-mono text-[11.5px] leading-5">
                    {email.bodyText}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Integrations"
          description="Slack and ClickUp hang off this record. Neither of them owns the project status."
        />
        <CardBody>
          {project.integrations.length === 0 ? (
            <Empty
              title="Nothing connected"
              description="Link a Slack channel and a ClickUp task from the Integrations page."
              className="py-6"
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {project.integrations.map((link) => (
                <li key={link.id} className="border-line rounded-[var(--radius-md)] border p-3">
                  <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">
                    {link.provider}
                  </p>
                  <p className="text-ink mt-0.5 text-[13px] font-medium">
                    {link.displayName ?? link.externalId}
                  </p>
                  {link.externalUrl && (
                    <a
                      href={link.externalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent-ink mt-1 inline-block text-[12px] underline-offset-4 hover:underline"
                    >
                      Open in {link.provider === 'SLACK' ? 'Slack' : 'ClickUp'}
                    </a>
                  )}
                  {link.lastSyncAt && (
                    <p className="text-faint mt-1 text-[11px]">
                      last synced {formatDateTime(link.lastSyncAt)}
                    </p>
                  )}
                  {link.lastError && (
                    <p className="text-danger-ink mt-1 text-[11px]">{link.lastError}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
