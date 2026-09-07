import { INTRO_EMAIL_STATUS_LABEL, formatDateTime } from '@relay/core';
import { integrations } from '@relay/integrations';
import { can } from '@relay/rbac';
import { Card, CardHeader, Empty, PermissionDenied, StatusPill } from '@relay/ui';
import { getProject, listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { IntegrationsPanel } from './integration-forms';
import { AssignmentForm, MerchantAccessForm, ProjectDetailsForm } from './settings-forms';

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

  const slackLink = project.integrations.find((link) => link.provider === 'SLACK') ?? null;
  const clickupLink = project.integrations.find((link) => link.provider === 'CLICKUP') ?? null;

  // Fetched only when there is nothing linked yet: once a channel is picked
  // there is no reason to hold this page's render on a live Slack call every
  // time someone opens Settings. Bounded either way by the 8s timeout every
  // live integrations call carries (D-044) rather than able to hang.
  let slackChannels: { channelId: string; channelName: string }[] = [];
  let slackChannelsError: string | null = null;
  if (!slackLink) {
    const result = await integrations().slack.listChannels();
    if (result.ok && result.data) {
      slackChannels = result.data.map((channel) => ({
        channelId: channel.channelId,
        channelName: channel.channelName ?? channel.channelId,
      }));
    } else {
      slackChannelsError = result.error?.userMessage ?? 'Slack channels could not be listed.';
    }
  }

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

      {can(principal, 'merchant:manage') && (
        <MerchantAccessForm
          code={project.code}
          members={project.members
            .filter((member) => member.user.role === 'MERCHANT')
            .map((member) => ({
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
            }))}
        />
      )}

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

      <IntegrationsPanel
        code={project.code}
        slackLink={
          slackLink && {
            externalId: slackLink.externalId,
            externalUrl: slackLink.externalUrl,
            displayName: slackLink.displayName,
            lastSyncAt: slackLink.lastSyncAt?.toISOString() ?? null,
            lastError: slackLink.lastError,
          }
        }
        clickupLink={
          clickupLink && {
            externalId: clickupLink.externalId,
            externalUrl: clickupLink.externalUrl,
            displayName: clickupLink.displayName,
            lastSyncAt: clickupLink.lastSyncAt?.toISOString() ?? null,
            lastError: clickupLink.lastError,
          }
        }
        slackChannels={slackChannels}
        slackChannelsError={slackChannelsError}
      />
    </div>
  );
}
