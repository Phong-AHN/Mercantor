'use client';

import { useState } from 'react';
import { ExternalLink, Link2, Unlink } from 'lucide-react';
import { formatDateTime } from '@relay/core';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FormActions,
  Input,
  Select,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  linkClickUpTaskAction,
  linkSlackChannelAction,
  unlinkIntegrationAction,
} from '@/features/integrations/actions';

interface LinkedIntegration {
  externalId: string;
  externalUrl: string | null;
  displayName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

/**
 * Replaces what used to be a read-only list on this page: linking a project
 * to Slack or ClickUp had no UI path at all before this, only `pnpm db:seed`
 * or a direct database write (see FUTURE-WORK.md). Each provider gets its
 * own connect/disconnect form; nothing here is a separate "which list"
 * setting for ClickUp, since `createClickUpTaskAction` already reads the
 * list off whichever task is linked here.
 */
export function IntegrationsPanel({
  code,
  slackLink,
  clickupLink,
  slackChannels,
  slackChannelsError,
}: {
  code: string;
  slackLink: LinkedIntegration | null;
  clickupLink: LinkedIntegration | null;
  slackChannels: { channelId: string; channelName: string }[];
  slackChannelsError: string | null;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Integrations"
        description="Slack and ClickUp hang off this record. Neither of them owns the project status."
      />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <SlackConnector
          code={code}
          link={slackLink}
          channels={slackChannels}
          channelsError={slackChannelsError}
        />
        <ClickUpConnector code={code} link={clickupLink} />
      </CardBody>
    </Card>
  );
}

function ConnectedLink({
  provider,
  link,
  onDisconnect,
  pending,
}: {
  provider: 'Slack' | 'ClickUp';
  link: LinkedIntegration;
  onDisconnect: () => void;
  pending: boolean;
}) {
  return (
    <div className="border-line rounded-[var(--radius-md)] border p-3">
      <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">{provider}</p>
      <p className="text-ink mt-0.5 text-[13px] font-medium">
        {link.displayName ?? link.externalId}
      </p>
      {link.externalUrl && (
        <a
          href={link.externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent-ink mt-1 inline-flex items-center gap-1 text-[12px] underline-offset-4 hover:underline"
        >
          Open in {provider}
          <ExternalLink className="size-3" />
        </a>
      )}
      {link.lastSyncAt && (
        <p className="text-faint mt-1 text-[11px]">last synced {formatDateTime(link.lastSyncAt)}</p>
      )}
      {link.lastError && <p className="text-danger-ink mt-1 text-[11px]">{link.lastError}</p>}
      <FormActions className="mt-3">
        <Button variant="ghost" size="sm" loading={pending} onClick={onDisconnect}>
          <Unlink className="size-3.5" />
          Disconnect
        </Button>
      </FormActions>
    </div>
  );
}

function SlackConnector({
  code,
  link,
  channels,
  channelsError,
}: {
  code: string;
  link: LinkedIntegration | null;
  channels: { channelId: string; channelName: string }[];
  channelsError: string | null;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.channelId ?? '');
  const linkAction = useAction(linkSlackChannelAction, {
    successMessage: 'Slack channel connected.',
  });
  const unlinkAction = useAction(unlinkIntegrationAction, {
    successMessage: 'Slack disconnected.',
  });

  if (link) {
    return (
      <ConnectedLink
        provider="Slack"
        link={link}
        pending={unlinkAction.pending}
        onDisconnect={() => unlinkAction.run({ code, provider: 'SLACK' })}
      />
    );
  }

  return (
    <div className="border-line rounded-[var(--radius-md)] border border-dashed p-3">
      <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">Slack</p>
      <p className="text-muted mt-1 text-[12px] leading-4">
        Portal updates post here with a link straight back to this record.
      </p>

      {linkAction.error && (
        <Alert tone="danger" dense className="mt-2">
          {linkAction.error}
        </Alert>
      )}

      {channelsError ? (
        <Alert tone="warning" dense className="mt-2">
          {channelsError}
        </Alert>
      ) : channels.length === 0 ? (
        <p className="text-faint mt-2 text-[12px]">No channels found for this workspace.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <Field label="Channel" htmlFor="slack-channel">
            <Select
              id="slack-channel"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel.channelId} value={channel.channelId}>
                  {channel.channelName}
                </option>
              ))}
            </Select>
          </Field>
          <FormActions>
            <Button
              variant="secondary"
              size="sm"
              loading={linkAction.pending}
              onClick={() => linkAction.run({ code, channelId })}
            >
              <Link2 className="size-3.5" />
              Connect
            </Button>
          </FormActions>
        </div>
      )}
    </div>
  );
}

function ClickUpConnector({ code, link }: { code: string; link: LinkedIntegration | null }) {
  const [task, setTask] = useState('');
  const linkAction = useAction(linkClickUpTaskAction, {
    successMessage: 'ClickUp task connected.',
    onSuccess: () => setTask(''),
  });
  const unlinkAction = useAction(unlinkIntegrationAction, {
    successMessage: 'ClickUp disconnected.',
  });

  if (link) {
    return (
      <ConnectedLink
        provider="ClickUp"
        link={link}
        pending={unlinkAction.pending}
        onDisconnect={() => unlinkAction.run({ code, provider: 'CLICKUP' })}
      />
    );
  }

  return (
    <div className="border-line rounded-[var(--radius-md)] border border-dashed p-3">
      <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">ClickUp</p>
      <p className="text-muted mt-1 text-[12px] leading-4">
        Stage changes push a status here. Issues create subtasks nested under it.
      </p>

      {linkAction.error && (
        <Alert tone="danger" dense className="mt-2">
          {linkAction.error}
        </Alert>
      )}

      <div className="mt-2 space-y-2">
        <Field
          label="Task ID or link"
          htmlFor="clickup-task"
          hint="Paste a task ID or an app.clickup.com/t/... link."
        >
          <Input
            id="clickup-task"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="https://app.clickup.com/t/abc123"
          />
        </Field>
        <FormActions>
          <Button
            variant="secondary"
            size="sm"
            loading={linkAction.pending}
            disabled={task.trim().length === 0}
            onClick={() => linkAction.run({ code, task })}
          >
            <Link2 className="size-3.5" />
            Connect
          </Button>
        </FormActions>
      </div>
    </div>
  );
}
