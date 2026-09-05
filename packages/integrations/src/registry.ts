import { env } from '@relay/config';
import { createClickUpProvider } from './clickup';
import { createResendProvider } from './email';
import { mockClickUpProvider, mockEmailProvider, mockSlackProvider } from './mock';
import { createSlackProvider } from './slack';
import type { ClickUpProvider, EmailProvider, IntegrationRegistry, SlackProvider } from './types';

/**
 * The only place a platform is chosen. A token in the environment selects the
 * live adapter; its absence selects the mock. Nothing above this line knows
 * which one it got, which is what makes "ready to plug in the real API" true
 * rather than aspirational.
 */
let cached: IntegrationRegistry | null = null;

export function integrations(): IntegrationRegistry {
  if (cached) return cached;
  const config = env();

  const slack: SlackProvider = config.SLACK_BOT_TOKEN
    ? createSlackProvider(config.SLACK_BOT_TOKEN)
    : mockSlackProvider;

  const clickup: ClickUpProvider = config.CLICKUP_API_TOKEN
    ? createClickUpProvider(config.CLICKUP_API_TOKEN)
    : mockClickUpProvider;

  const email: EmailProvider = config.RESEND_API_KEY
    ? createResendProvider(config.RESEND_API_KEY, config.EMAIL_FROM)
    : mockEmailProvider;

  cached = { slack, clickup, email };
  return cached;
}

/** Test hook: forces the registry to be rebuilt from the current environment. */
export function resetIntegrations(): void {
  cached = null;
}

export async function integrationHealth() {
  const registry = integrations();
  const [slack, clickup, email] = await Promise.all([
    registry.slack.health(),
    registry.clickup.health(),
    registry.email.health(),
  ]);
  return { slack, clickup, email };
}
