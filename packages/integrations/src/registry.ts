import { decryptSecret, encryptSecret } from '@relay/core/server';
import { env } from '@relay/config';
import { db, type IntegrationProvider } from '@relay/db';
import { createClickUpProvider } from './clickup';
import { createResendProvider } from './email';
import { mockClickUpProvider, mockEmailProvider, mockSlackProvider } from './mock';
import { createSlackProvider } from './slack';
import type { ClickUpProvider, EmailProvider, IntegrationRegistry, SlackProvider } from './types';

/**
 * Each organization's own Slack/ClickUp/Resend credentials (D-052) - not one
 * shared process-wide `.env` selecting a single global adapter for every
 * tenant. A configured, active row for a provider selects the live adapter;
 * its absence selects the mock, the same meaning an absent env var used to
 * carry. Resolved fresh on every call rather than cached: a self-service
 * settings UI means an organization's own token can change at any moment,
 * and a stale cached adapter serving the *previous* token is a worse bug
 * than the extra database read.
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

async function loadConfig<T>(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<T | null> {
  const row = await db.organizationIntegration.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { encryptedConfig: true, isActive: true },
  });
  if (!row || !row.isActive) return null;
  try {
    const decrypted = decryptSecret(row.encryptedConfig, env().CREDENTIAL_ENCRYPTION_KEY);
    return JSON.parse(decrypted) as T;
  } catch {
    // A blob that fails to decrypt (wrong/rotated CREDENTIAL_ENCRYPTION_KEY,
    // corruption) must not crash whatever called this - fall back to the
    // mock, the same as never having configured the provider at all.
    return null;
  }
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
