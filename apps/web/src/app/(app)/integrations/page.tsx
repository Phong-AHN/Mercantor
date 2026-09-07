import type { Metadata } from 'next';
import { Mail, MessageSquare, SquareKanban } from 'lucide-react';
import { clock, formatDateTime, formatRelative } from '@relay/core';
import {
  clickUpOAuthConfigured,
  integrationHealthFor,
  slackOAuthConfigured,
} from '@relay/integrations';
import { can } from '@relay/rbac';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Empty,
  PageHeader,
  PermissionDenied,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { listOutbox } from '@/features/workspace/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import {
  ClickUpCredentialsForm,
  EmailCredentialsForm,
  SlackCredentialsForm,
} from './credentials-panel';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

const OUTBOX_TONE = {
  PENDING: 'warning',
  DELIVERED: 'success',
  FAILED: 'danger',
  SKIPPED: 'muted',
} as const;

const OAUTH_ERROR_MESSAGE: Record<string, string> = {
  slack_state: 'That Slack connection attempt expired or was opened in another tab. Try again.',
  slack_denied: 'Slack authorization was cancelled - nothing was connected.',
  slack_forbidden: 'Your account cannot manage integrations for an organization.',
  slack_no_code: 'Slack did not return an authorization code. Try again.',
  slack_exchange: 'Slack could not complete the connection. Try again, or paste a token directly.',
  clickup_state: 'That ClickUp connection attempt expired or was opened in another tab. Try again.',
  clickup_denied: 'ClickUp authorization was cancelled - nothing was connected.',
  clickup_forbidden: 'Your account cannot manage integrations for an organization.',
  clickup_no_code: 'ClickUp did not return an authorization code. Try again.',
  clickup_exchange:
    'ClickUp could not complete the connection. Try again, or paste a token directly.',
};

const CONNECTED_LABEL: Record<string, string> = { slack: 'Slack', clickup: 'ClickUp' };

/**
 * Integrations are the seam, and this page is where you can see whether the
 * seam is holding. The outbox is the honest bit: a message that has not gone
 * out yet is visible here rather than silently lost.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; oauth_error?: string }>;
}) {
  const principal = await requirePrincipalOrRedirect('/integrations');
  if (!can(principal, 'integration:manage')) return <PermissionDenied />;
  if (!principal.organizationId) return <PermissionDenied />;

  const { connected, oauth_error: oauthError } = await searchParams;

  const [health, outbox] = await Promise.all([
    integrationHealthFor(principal.organizationId),
    listOutbox(principal),
  ]);
  const now = clock.now();
  const slackOAuth = slackOAuthConfigured();
  const clickUpOAuth = clickUpOAuthConfigured();

  const providers = [
    {
      key: 'slack' as const,
      name: 'Slack',
      icon: <MessageSquare className="size-4" />,
      health: health.slack,
      blurb:
        'Project updates post to the linked channel with a link straight back to the record. Important Slack messages can be pulled back into the project history.',
      form: (
        <SlackCredentialsForm
          connected={health.slack.mode === 'live'}
          oauthConfigured={slackOAuth}
        />
      ),
    },
    {
      key: 'clickup' as const,
      name: 'ClickUp',
      icon: <SquareKanban className="size-4" />,
      health: health.clickup,
      blurb:
        'Stage changes push a status to the linked task. ClickUp stays your execution layer; the portal stays the shared source of truth.',
      form: (
        <ClickUpCredentialsForm
          connected={health.clickup.mode === 'live'}
          oauthConfigured={clickUpOAuth}
        />
      ),
    },
    {
      key: 'email' as const,
      name: 'Email',
      icon: <Mail className="size-4" />,
      health: health.email,
      blurb: 'Delivers the standardised merchant introduction, generated from the project record.',
      form: <EmailCredentialsForm connected={health.email.mode === 'live'} />,
    },
  ];

  const mocked = providers.filter((provider) => provider.health.mode === 'mock');
  const failed = outbox.filter((message) => message.status === 'FAILED');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        description="Slack, ClickUp and email hang off the project record. None of them owns project status."
      />

      {connected && (
        <Alert tone="success" title={`${CONNECTED_LABEL[connected] ?? connected} connected`}>
          Authorized through {CONNECTED_LABEL[connected] ?? connected} directly - no token was ever
          typed in.
        </Alert>
      )}

      {oauthError && (
        <Alert tone="danger" title="Connection failed">
          {OAUTH_ERROR_MESSAGE[oauthError] ?? 'That connection attempt failed. Try again.'}
        </Alert>
      )}

      {mocked.length > 0 && (
        <Alert tone="info" title={`${mocked.length} integration(s) running in mock mode`}>
          Messages are recorded in the outbox but not delivered. Connect{' '}
          {mocked.map((provider) => provider.name).join(', ')} below to go live - nothing else
          changes.
        </Alert>
      )}

      {failed.length > 0 && (
        <Alert tone="danger" title={`${failed.length} outbound message(s) failed`}>
          They stay in the outbox and are retried every two minutes by the worker.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.key}>
            <CardHeader
              icon={provider.icon}
              title={provider.name}
              actions={
                <Badge
                  tone={
                    provider.health.mode === 'mock'
                      ? 'muted'
                      : provider.health.reachable
                        ? 'success'
                        : 'danger'
                  }
                  size="sm"
                  dot
                >
                  {provider.health.mode === 'mock'
                    ? 'mock'
                    : provider.health.reachable
                      ? 'live'
                      : 'unreachable'}
                </Badge>
              }
            />
            <CardBody className="space-y-3">
              <p className="text-muted text-[12.5px] leading-5">{provider.blurb}</p>
              <p className="bg-surface-2 text-ink-soft rounded-[var(--radius-sm)] px-3 py-2 text-[12px] leading-4">
                {provider.health.detail}
              </p>
              {provider.form}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Outbound queue"
          count={outbox.length}
          description="Written in the same transaction as the change it describes, so an integration outage delays an update rather than losing it."
        />
        {outbox.length === 0 ? (
          <Empty title="Nothing queued" className="py-12" />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH>Provider</TH>
                  <TH>Kind</TH>
                  <TH className="min-w-[13rem]">Project</TH>
                  <TH>Status</TH>
                  <TH numeric>Attempts</TH>
                  <TH>Queued</TH>
                  <TH>Delivered</TH>
                  <TH className="min-w-[14rem]">Last error</TH>
                </tr>
              </THead>
              <TBody>
                {outbox.map((message) => (
                  <TR key={message.id}>
                    <TD>
                      <Badge tone="neutral" size="sm">
                        {message.provider}
                      </Badge>
                    </TD>
                    <TD className="text-muted font-mono text-[11.5px]">{message.kind}</TD>
                    <TD className="text-ink-soft text-[12.5px]">
                      {message.project
                        ? `${message.project.merchant.name} (${message.project.code})`
                        : '-'}
                    </TD>
                    <TD>
                      <Badge tone={OUTBOX_TONE[message.status]} size="sm" dot>
                        {message.status.toLowerCase()}
                      </Badge>
                    </TD>
                    <TD numeric className="text-muted text-[12.5px]">
                      {message.attempts}
                    </TD>
                    <TD className="text-muted text-[12px]">
                      {formatRelative(message.createdAt, now)}
                    </TD>
                    <TD className="text-muted text-[12px]">
                      {message.deliveredAt ? formatDateTime(message.deliveredAt) : '-'}
                    </TD>
                    <TD className="text-danger-ink text-[11.5px]">{message.lastError ?? '-'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </div>
  );
}
