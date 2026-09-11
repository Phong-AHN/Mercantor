import { clock } from '@relay/core';
import type {
  ClickUpProvider,
  ClickUpStatusUpdate,
  ClickUpTaskDraft,
  ClickUpTaskRef,
  EmailMessage,
  EmailProvider,
  ProviderHealth,
  ProviderResult,
  SlackDestination,
  SlackImportedMessage,
  SlackProvider,
  SlackUpdate,
} from './types';

/**
 * Mock adapters. They answer locally so the whole flow - introduction email,
 * Slack notification, ClickUp status sync - is demonstrable and testable with
 * no third-party credentials. Everything they "deliver" is recorded in the
 * outbox, so the portal shows exactly what would have been sent.
 *
 * When a real token is configured the registry returns the live adapter
 * instead; nothing above this seam changes.
 */

export interface MockDelivery {
  provider: 'SLACK' | 'CLICKUP' | 'EMAIL';
  kind: string;
  at: Date;
  payload: unknown;
}

const deliveries: MockDelivery[] = [];

export function mockDeliveries(): readonly MockDelivery[] {
  return deliveries;
}

export function clearMockDeliveries(): void {
  deliveries.length = 0;
}

function record(provider: MockDelivery['provider'], kind: string, payload: unknown): void {
  deliveries.push({ provider, kind, at: clock.now(), payload });
  if (deliveries.length > 500) deliveries.splice(0, deliveries.length - 500);
}

const MOCK_HEALTH = (name: string): ProviderHealth => ({
  configured: false,
  reachable: true,
  mode: 'mock',
  detail: `${name} is running in mock mode. Messages are recorded in the outbox but not delivered. Add a token to go live.`,
});

const MOCK_CHANNELS: SlackDestination[] = [
  { channelId: 'C-SHOPLINE-MIGRATIONS', channelName: '#shopline-migrations' },
  { channelId: 'C-SHOPLINE-LAUNCHES', channelName: '#shopline-launches' },
  { channelId: 'C-AHN-DELIVERY', channelName: '#ahn-delivery' },
  { channelId: 'C-AHN-SHOPLINE-ESCALATION', channelName: '#ahn-shopline-escalation' },
];

export const mockSlackProvider: SlackProvider = {
  name: 'SLACK',
  async health() {
    return MOCK_HEALTH('Slack');
  },
  async listChannels(): Promise<ProviderResult<SlackDestination[]>> {
    return { ok: true, data: MOCK_CHANNELS };
  },
  async postUpdate(update: SlackUpdate): Promise<ProviderResult> {
    record('SLACK', 'post_update', update);
    return {
      ok: true,
      externalRef: `mock-${clock.now().getTime()}`,
      externalUrl: `https://slack.example/archives/${update.destination.channelId}`,
    };
  },
  async fetchMessage(permalink: string): Promise<ProviderResult<SlackImportedMessage>> {
    record('SLACK', 'fetch_message', { permalink });
    const match = /archives\/([^/]+)\/p(\d+)/.exec(permalink);
    if (!match) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          userMessage: 'That does not look like a Slack message permalink.',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      data: {
        channelId: match[1] ?? 'C-UNKNOWN',
        messageTs: match[2] ?? '0',
        permalink,
        authorName: 'Slack user',
        text: 'Imported from Slack in mock mode. Connect a bot token to pull the real text.',
        postedAt: clock.now(),
      },
    };
  },
  async findUserByEmail(email: string): Promise<ProviderResult<{ slackUserId: string }>> {
    record('SLACK', 'find_user_by_email', { email });
    return { ok: true, data: { slackUserId: `mock-U${email.replace(/[^a-z0-9]/gi, '')}` } };
  },
};

let mockTaskSequence = 1000;

export const mockClickUpProvider: ClickUpProvider = {
  name: 'CLICKUP',
  async health() {
    return MOCK_HEALTH('ClickUp');
  },
  async getTask(taskId: string): Promise<ProviderResult<ClickUpTaskRef>> {
    return {
      ok: true,
      data: {
        taskId,
        url: `https://app.clickup.com/t/${taskId}`,
        status: 'in progress',
        listId: `mock-list-${taskId}`,
      },
    };
  },
  async createTask(draft: ClickUpTaskDraft): Promise<ProviderResult<ClickUpTaskRef>> {
    mockTaskSequence += 1;
    const taskId = `mock${mockTaskSequence}`;
    record('CLICKUP', 'create_task', draft);
    return {
      ok: true,
      externalRef: taskId,
      externalUrl: `https://app.clickup.com/t/${taskId}`,
      data: { taskId, url: `https://app.clickup.com/t/${taskId}`, name: draft.name },
    };
  },
  async updateStatus(update: ClickUpStatusUpdate): Promise<ProviderResult> {
    record('CLICKUP', 'update_status', update);
    return { ok: true, externalRef: update.taskId };
  },
  async comment(taskId: string, body: string): Promise<ProviderResult> {
    record('CLICKUP', 'comment', { taskId, body });
    return { ok: true, externalRef: taskId };
  },
  async createWebhook(teamId: string, endpointUrl: string) {
    record('CLICKUP', 'create_webhook', { teamId, endpointUrl });
    return { ok: true, data: { webhookId: `mock-webhook-${teamId}`, secret: 'mock-secret' } };
  },
  async deleteWebhook(webhookId: string) {
    record('CLICKUP', 'delete_webhook', { webhookId });
    return { ok: true };
  },
};

export const mockEmailProvider: EmailProvider = {
  name: 'EMAIL',
  async health() {
    return MOCK_HEALTH('Email');
  },
  async send(message: EmailMessage): Promise<ProviderResult<{ messageId: string }>> {
    record('EMAIL', 'send', {
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      textPreview: message.text.slice(0, 400),
    });
    const messageId = `mock-${clock.now().getTime()}@relay.local`;
    return { ok: true, externalRef: messageId, data: { messageId } };
  },
};
