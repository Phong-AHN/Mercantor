import { decryptSecret, encryptSecret } from '@relay/core/server';
import { env } from '@relay/config';
import { db, type IntegrationProvider } from '@relay/db';
import { createClickUpProvider } from './clickup';
import { createResendProvider } from './email';
import { mockClickUpProvider, mockEmailProvider, mockSlackProvider } from './mock';
import { createSlackProvider } from './slack';
import type { ClickUpProvider, EmailProvider, IntegrationRegistry, SlackProvider } from './types';

/**
 * Each organization's own Slack/ClickUp/Resend credentials (D-052) come
 * first - not one shared process-wide `.env` selecting a single global
 * adapter for every tenant. A configured, active row for a provider selects
 * the live adapter. Resolved fresh on every call rather than cached: a
 * self-service settings UI means an organization's own token can change at
 * any moment, and a stale cached adapter serving the *previous* token is a
 * worse bug than the extra database read.
 *
 * **Falls back to the process-wide `.env` credentials when an organization
 * has not configured its own (or its stored one fails to decrypt) - only
 * then does it fall to the mock.** Self-service per-organization credentials
 * are the intended long-term shape, but in practice most organizations here
 * are still using AHN's own single shared Slack/ClickUp/Resend account, not
 * one of their own - requiring every one of them to separately paste a
 * working token before Slack/ClickUp/email would do anything real broke
 * exactly that, live, for organizations that had never gone through
 * `/integrations` at all. `envFallbackConfig` below is what makes
 * `SLACK_BOT_TOKEN` / `CLICKUP_API_TOKEN` / `RESEND_API_KEY` do something
 * again - declared in `packages/config/src/env.ts` all along, unread since
 * D-052 until now.
 */

interface SlackConfig {
  botToken: string;
}
interface ClickUpConfig {
  apiToken: string;
  teamId?: string;
}
interface EmailConfig {
  apiKey: string;
  from: string;
}

/**
 * The pre-D-052 shape, reconstructed from `.env` - the same config shape
 * `setOrganizationIntegration` would have encrypted and stored, so the
 * adapter it feeds cannot tell the difference. Absent env vars (the normal
 * case for a provider nobody has wired up at all, at the org or the
 * process level) return `null`, same as an unconfigured organization -
 * `integrationsFor` falls to the mock either way.
 */
function envFallbackConfig<T>(provider: IntegrationProvider): T | null {
  const config = env();
  switch (provider) {
    case 'SLACK':
      return config.SLACK_BOT_TOKEN
        ? ({ botToken: config.SLACK_BOT_TOKEN } satisfies SlackConfig as T)
        : null;
    case 'CLICKUP':
      return config.CLICKUP_API_TOKEN
        ? ({
            apiToken: config.CLICKUP_API_TOKEN,
            teamId: config.CLICKUP_TEAM_ID,
          } satisfies ClickUpConfig as T)
        : null;
    case 'EMAIL':
      return config.RESEND_API_KEY
        ? ({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM } satisfies EmailConfig as T)
        : null;
    default:
      return null;
  }
}

async function loadConfig<T>(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<T | null> {
  const row = await db.organizationIntegration.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { encryptedConfig: true, isActive: true },
  });

  if (row?.isActive) {
    try {
      const decrypted = decryptSecret(row.encryptedConfig, env().CREDENTIAL_ENCRYPTION_KEY);
      return JSON.parse(decrypted) as T;
    } catch {
      // A blob that fails to decrypt (wrong/rotated CREDENTIAL_ENCRYPTION_KEY,
      // corruption) must not crash whatever called this - fall through to
      // the environment fallback below, same as never having configured the
      // provider at all.
    }
  }

  return envFallbackConfig<T>(provider);
}

/**
 * `organizationId: null` (only `PLATFORM_ADMIN` - the SaaS operator, not a
 * tenant - ever has one) always gets every mock adapter: there is no
 * organization whose credentials it could possibly use.
 */
export async function integrationsFor(organizationId: string | null): Promise<IntegrationRegistry> {
  if (!organizationId) {
    return { slack: mockSlackProvider, clickup: mockClickUpProvider, email: mockEmailProvider };
  }

  const [slackConfig, clickupConfig, emailConfig] = await Promise.all([
    loadConfig<SlackConfig>(organizationId, 'SLACK'),
    loadConfig<ClickUpConfig>(organizationId, 'CLICKUP'),
    loadConfig<EmailConfig>(organizationId, 'EMAIL'),
  ]);

  const slack: SlackProvider = slackConfig
    ? createSlackProvider(slackConfig.botToken)
    : mockSlackProvider;
  const clickup: ClickUpProvider = clickupConfig
    ? createClickUpProvider(clickupConfig.apiToken)
    : mockClickUpProvider;
  const email: EmailProvider = emailConfig
    ? createResendProvider(emailConfig.apiKey, emailConfig.from)
    : mockEmailProvider;

  return { slack, clickup, email };
}

export async function integrationHealthFor(organizationId: string | null) {
  const registry = await integrationsFor(organizationId);
  const [slack, clickup, email] = await Promise.all([
    registry.slack.health(),
    registry.clickup.health(),
    registry.email.health(),
  ]);
  return { slack, clickup, email };
}

/**
 * Encrypts and upserts one provider's config for an organization -
 * `OrganizationIntegration.encryptedConfig` is never written any other way.
 * `config: null` clears it back to the mock adapter (a self-service
 * "disconnect", not only a way to connect).
 */
export async function setOrganizationIntegration(input: {
  organizationId: string;
  provider: IntegrationProvider;
  config: SlackConfig | ClickUpConfig | EmailConfig | null;
  configuredById: string;
}): Promise<void> {
  if (input.config === null) {
    await db.organizationIntegration.deleteMany({
      where: { organizationId: input.organizationId, provider: input.provider },
    });
    return;
  }

  const encryptedConfig = encryptSecret(
    JSON.stringify(input.config),
    env().CREDENTIAL_ENCRYPTION_KEY,
  );

  await db.organizationIntegration.upsert({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: input.provider },
    },
    create: {
      organizationId: input.organizationId,
      provider: input.provider,
      encryptedConfig,
      configuredById: input.configuredById,
    },
    update: {
      encryptedConfig,
      isActive: true,
      configuredById: input.configuredById,
    },
  });
}
