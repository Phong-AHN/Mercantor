'use client';

import { useState } from 'react';
import { KeyRound, Unlink, Zap } from 'lucide-react';
import { Alert, Button, buttonStyles, Field, FormActions, Input } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  clearOrganizationIntegrationAction,
  setOrganizationIntegrationAction,
} from '@/features/integrations/actions';

/**
 * Self-service credentials (D-052) - what used to be one shared `.env` file
 * only AHN could edit is now a form any organization's own admin fills in.
 * Each provider gets its own connect/disconnect form, the same shape
 * `IntegrationsPanel` (the per-project Slack/ClickUp links) already uses for
 * "connected" vs "not yet" - `mode === 'live'` on the health this page
 * already fetched is exactly "this organization has a row", so no extra
 * fetch is needed to decide which state to render.
 *
 * Slack and ClickUp also get an OAuth "Connect" button (D-053) - the
 * organization's own admin authorizes AHN's app from Slack's/ClickUp's own
 * consent screen instead of ever copying a token. It only renders when the
 * platform has registered an OAuth app at all (`oauthConfigured`, computed
 * server-side from whether the client id/secret env vars are set); the
 * manual-paste form underneath it never goes away - a workspace whose admin
 * has restricted app installs, or one that already has a token handy, still
 * has a path in.
 */

function Disconnect({ onDisconnect, pending }: { onDisconnect: () => void; pending: boolean }) {
  return (
    <FormActions className="mt-3">
      <Button variant="ghost" size="sm" loading={pending} onClick={onDisconnect}>
        <Unlink className="size-3.5" />
        Disconnect
      </Button>
    </FormActions>
  );
}

function ConnectViaOAuth({
  href,
  label,
  onUseManual,
}: {
  href: string;
  label: string;
  onUseManual: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <a href={href} className={buttonStyles('secondary', 'sm')}>
        <Zap className="size-3.5" />
        {label}
      </a>
      <div>
        <Button variant="link" size="sm" onClick={onUseManual}>
          Or paste a token directly
        </Button>
      </div>
    </div>
  );
}

export function SlackCredentialsForm({
  connected,
  oauthConfigured,
}: {
  connected: boolean;
  oauthConfigured: boolean;
}) {
  const [botToken, setBotToken] = useState('');
  const [manual, setManual] = useState(!oauthConfigured);
  const connect = useAction(setOrganizationIntegrationAction, {
    successMessage: 'Slack connected.',
    onSuccess: () => setBotToken(''),
  });
  const disconnect = useAction(clearOrganizationIntegrationAction, {
    successMessage: 'Slack disconnected.',
  });

  if (connected) {
    return (
      <Disconnect
        pending={disconnect.pending}
        onDisconnect={() => disconnect.run({ provider: 'SLACK' })}
      />
    );
  }

  if (!manual) {
    return (
      <ConnectViaOAuth
        href="/api/oauth/slack/start"
        label="Connect via Slack"
        onUseManual={() => setManual(true)}
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
      <Field
        label="Bot token"
        htmlFor="slack-bot-token"
        hint="From your Slack app's OAuth & Permissions page. Starts with xoxb-."
      >
        <Input
          id="slack-bot-token"
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
          Connect
        </Button>
        {oauthConfigured && (
          <Button variant="link" size="sm" onClick={() => setManual(false)}>
            Use Connect via Slack instead
          </Button>
        )}
      </FormActions>
    </div>
  );
}

export function ClickUpCredentialsForm({
  connected,
  oauthConfigured,
}: {
  connected: boolean;
  oauthConfigured: boolean;
}) {
  const [apiToken, setApiToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [manual, setManual] = useState(!oauthConfigured);
  const connect = useAction(setOrganizationIntegrationAction, {
    successMessage: 'ClickUp connected.',
    onSuccess: () => {
      setApiToken('');
      setTeamId('');
    },
  });
  const disconnect = useAction(clearOrganizationIntegrationAction, {
    successMessage: 'ClickUp disconnected.',
  });

  if (connected) {
    return (
      <Disconnect
        pending={disconnect.pending}
        onDisconnect={() => disconnect.run({ provider: 'CLICKUP' })}
      />
    );
  }

  if (!manual) {
    return (
      <ConnectViaOAuth
        href="/api/oauth/clickup/start"
        label="Connect via ClickUp"
        onUseManual={() => setManual(true)}
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
      <Field label="API token" htmlFor="clickup-api-token" hint="From ClickUp's Apps settings.">
        <Input
          id="clickup-api-token"
          type="password"
          value={apiToken}
          onChange={(event) => setApiToken(event.target.value)}
          placeholder="pk_..."
          autoComplete="off"
        />
      </Field>
      <Field label="Team ID" htmlFor="clickup-team-id" hint="Optional.">
        <Input
          id="clickup-team-id"
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
          Connect
        </Button>
        {oauthConfigured && (
          <Button variant="link" size="sm" onClick={() => setManual(false)}>
            Use Connect via ClickUp instead
          </Button>
        )}
      </FormActions>
    </div>
  );
}

export function EmailCredentialsForm({ connected }: { connected: boolean }) {
  const [apiKey, setApiKey] = useState('');
  const [from, setFrom] = useState('');
  const connect = useAction(setOrganizationIntegrationAction, {
    successMessage: 'Email connected.',
    onSuccess: () => {
      setApiKey('');
      setFrom('');
    },
  });
  const disconnect = useAction(clearOrganizationIntegrationAction, {
    successMessage: 'Email disconnected.',
  });

  if (connected) {
    return (
      <Disconnect
        pending={disconnect.pending}
        onDisconnect={() => disconnect.run({ provider: 'EMAIL' })}
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
      <Field label="Resend API key" htmlFor="email-api-key">
        <Input
          id="email-api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="re_..."
          autoComplete="off"
        />
      </Field>
      <Field label="From address" htmlFor="email-from" hint="Must be a domain verified in Resend.">
        <Input
          id="email-from"
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
          Connect
        </Button>
      </FormActions>
    </div>
  );
}
