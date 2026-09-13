'use client';

import { useState } from 'react';
import { KeyRound, Unlink } from 'lucide-react';
import { Alert, Button, Field, FormActions, Input } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  clearPlatformIntegrationAction,
  setPlatformIntegrationAction,
} from '@/features/platform/actions';

/**
 * The shared fallback credential form for one provider - the same shape as
 * `credentials-panel.tsx`'s per-organization forms, minus OAuth (there is no
 * single organization to authorize as here) and with a "configured by / at"
 * line instead of a live health badge, since this tier is a floor other
 * organizations quietly fall to rather than something meant to be watched.
 */

function Disconnect({ onDisconnect, pending }: { onDisconnect: () => void; pending: boolean }) {
  return (
    <FormActions className="mt-3">
      <Button variant="ghost" size="sm" loading={pending} onClick={onDisconnect}>
        <Unlink className="size-3.5" />
        Clear
      </Button>
    </FormActions>
  );
}

export function PlatformSlackForm({ configured }: { configured: boolean }) {
  const [botToken, setBotToken] = useState('');
  const connect = useAction(setPlatformIntegrationAction, { onSuccess: () => setBotToken('') });
  const disconnect = useAction(clearPlatformIntegrationAction);

  if (configured) {
    return (
      <Disconnect pending={disconnect.pending} onDisconnect={() => disconnect.run({ provider: 'SLACK' })} />
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {connect.error && (
        <Alert tone="danger" dense>
          {connect.error}
        </Alert>
      )}
      <Field
        label="Bot token"
        htmlFor="platform-slack-bot-token"
        hint="Used by any organization that has not connected its own Slack workspace."
      >
        <Input
          id="platform-slack-bot-token"
          type="password"
          value={botToken}
          onChange={(event) => setBotToken(event.target.value)}
          placeholder="xoxb-..."
          autoComplete="off"
        />
      </Field>
      <FormActions>
        <Button
          variant="secondary"
          size="sm"
          loading={connect.pending}
          disabled={botToken.trim().length === 0}
          onClick={() => connect.run({ provider: 'SLACK', botToken })}
        >
          <KeyRound className="size-3.5" />
          Save
        </Button>
      </FormActions>
    </div>
  );
}

export function PlatformClickUpForm({ configured }: { configured: boolean }) {
  const [apiToken, setApiToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const connect = useAction(setPlatformIntegrationAction, {
    onSuccess: () => {
      setApiToken('');
      setTeamId('');
    },
  });
  const disconnect = useAction(clearPlatformIntegrationAction);

  if (configured) {
    return (
      <Disconnect
        pending={disconnect.pending}
        onDisconnect={() => disconnect.run({ provider: 'CLICKUP' })}
      />
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {connect.error && (
        <Alert tone="danger" dense>
          {connect.error}
        </Alert>
      )}
      <Field label="API token" htmlFor="platform-clickup-api-token" hint="From ClickUp's Apps settings.">
        <Input
          id="platform-clickup-api-token"
          type="password"
          value={apiToken}
          onChange={(event) => setApiToken(event.target.value)}
          placeholder="pk_..."
          autoComplete="off"
        />
      </Field>
      <Field
        label="Team ID"
        htmlFor="platform-clickup-team-id"
        hint="Optional - only used for status push, never a webhook at this tier."
      >
        <Input
          id="platform-clickup-team-id"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          placeholder="Optional"
        />
      </Field>
      <FormActions>
        <Button
          variant="secondary"
          size="sm"
          loading={connect.pending}
          disabled={apiToken.trim().length === 0}
          onClick={() =>
            connect.run({ provider: 'CLICKUP', apiToken, teamId: teamId.trim() || undefined })
          }
        >
          <KeyRound className="size-3.5" />
          Save
        </Button>
      </FormActions>
    </div>
  );
}

export function PlatformEmailForm({ configured }: { configured: boolean }) {
  const [apiKey, setApiKey] = useState('');
  const [from, setFrom] = useState('');
  const connect = useAction(setPlatformIntegrationAction, {
    onSuccess: () => {
      setApiKey('');
      setFrom('');
    },
  });
  const disconnect = useAction(clearPlatformIntegrationAction);

  if (configured) {
    return (
      <Disconnect pending={disconnect.pending} onDisconnect={() => disconnect.run({ provider: 'EMAIL' })} />
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {connect.error && (
        <Alert tone="danger" dense>
          {connect.error}
        </Alert>
      )}
      <Field label="Resend API key" htmlFor="platform-email-api-key">
        <Input
          id="platform-email-api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="re_..."
          autoComplete="off"
        />
      </Field>
      <Field label="From address" htmlFor="platform-email-from" hint="Must be a domain verified in Resend.">
        <Input
          id="platform-email-from"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          placeholder="migrations@yourcompany.com"
        />
      </Field>
      <FormActions>
        <Button
          variant="secondary"
          size="sm"
          loading={connect.pending}
          disabled={apiKey.trim().length === 0 || from.trim().length === 0}
          onClick={() => connect.run({ provider: 'EMAIL', apiKey, from })}
        >
          <KeyRound className="size-3.5" />
          Save
        </Button>
      </FormActions>
    </div>
  );
}
