import type {
  ProviderError,
  ProviderHealth,
  ProviderResult,
  SlackDestination,
  SlackImportedMessage,
  SlackProvider,
  SlackUpdate,
} from './types';

const SLACK_API = 'https://slack.com/api';

const TONE_COLOR: Record<SlackUpdate['tone'], string> = {
  info: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

/**
 * Live Slack adapter over the Web API. All Slack-specific shapes stay inside
 * this file: callers deal in `SlackUpdate`, never in Block Kit.
 */
export function createSlackProvider(botToken: string): SlackProvider {
  async function call<T>(method: string, body: unknown): Promise<ProviderResult<T>> {
    let response: Response;
    try {
      response = await fetch(`${SLACK_API}/${method}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${botToken}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      return { ok: false, error: unavailable(String(cause)) };
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '30');
      return {
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          userMessage: 'Slack is rate limiting us. The update will be retried automatically.',
          retryable: true,
          retryAfterMs: retryAfter * 1000,
        },
      };
    }

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      [key: string]: unknown;
    };

    if (!payload.ok) return { ok: false, error: normalise(payload.error) };
    return { ok: true, data: payload as T };
  }

  return {
    name: 'SLACK',

    async health(): Promise<ProviderHealth> {
      const result = await call<{ team?: string }>('auth.test', {});
      return {
        configured: true,
        reachable: result.ok,
        mode: 'live',
        detail: result.ok
          ? `Connected to Slack workspace ${result.data?.team ?? ''}`.trim()
          : (result.error?.userMessage ?? 'Slack did not answer.'),
      };
    },

    async listChannels(): Promise<ProviderResult<SlackDestination[]>> {
      const result = await call<{ channels?: { id: string; name: string }[] }>(
        'conversations.list',
        { types: 'public_channel,private_channel', limit: 200, exclude_archived: true },
      );
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        data: (result.data?.channels ?? []).map((channel) => ({
          channelId: channel.id,
          channelName: `#${channel.name}`,
        })),
      };
    },

    async postUpdate(update: SlackUpdate): Promise<ProviderResult> {
      const fields = (update.fields ?? []).map((field) => ({
        type: 'mrkdwn',
        text: `*${field.label}*\n${field.value}`,
      }));

      const result = await call<{ ts?: string; channel?: string }>('chat.postMessage', {
        channel: update.destination.channelId,
        text: `${update.projectCode}: ${update.title}`,
        attachments: [
          {
            color: TONE_COLOR[update.tone],
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*${escape(update.title)}*` },
              },
              ...(update.body
                ? [{ type: 'section', text: { type: 'mrkdwn', text: escape(update.body) } }]
                : []),
              ...(fields.length > 0 ? [{ type: 'section', fields: fields.slice(0, 10) }] : []),
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: `Open ${update.projectCode}` },
                    url: update.projectUrl,
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, externalRef: result.data?.ts, externalUrl: update.projectUrl };
    },

    async fetchMessage(permalink: string): Promise<ProviderResult<SlackImportedMessage>> {
      const match = /archives\/([^/?]+)\/p(\d+)/.exec(permalink);
      if (!match?.[1] || !match[2]) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            userMessage: 'That does not look like a Slack message permalink.',
            retryable: false,
          },
        };
      }
      const channelId = match[1];
      const raw = match[2];
      const ts = `${raw.slice(0, 10)}.${raw.slice(10)}`;

      const result = await call<{ messages?: { text?: string; user?: string; ts?: string }[] }>(
        'conversations.history',
        { channel: channelId, latest: ts, oldest: ts, inclusive: true, limit: 1 },
      );
      if (!result.ok) return { ok: false, error: result.error };

      const message = result.data?.messages?.[0];
      if (!message) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            userMessage: 'Slack has no message at that link, or the bot is not in that channel.',
            retryable: false,
          },
        };
      }

      return {
        ok: true,
        data: {
          channelId,
          messageTs: ts,
          permalink,
          authorName: message.user ?? 'Slack user',
          text: message.text ?? '',
          postedAt: new Date(Number(ts.split('.')[0]) * 1000),
        },
      };
    },

    async findUserByEmail(email: string): Promise<ProviderResult<{ slackUserId: string }>> {
      const result = await call<{ user?: { id?: string } }>('users.lookupByEmail', { email });
      if (!result.ok) return { ok: false, error: result.error };
      const slackUserId = result.data?.user?.id;
      if (!slackUserId) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            userMessage: 'No Slack account is registered for that email.',
            retryable: false,
          },
        };
      }
      return { ok: true, data: { slackUserId } };
    },
  };
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unavailable(detail: string): ProviderError {
  return {
    code: 'UNAVAILABLE',
    userMessage: 'Slack could not be reached. The update is queued and will be retried.',
    retryable: true,
    ...(detail ? {} : {}),
  };
}

/** Slack error strings never reach a user unmapped. */
function normalise(code: string | undefined): ProviderError {
  switch (code) {
    case 'invalid_auth':
    case 'not_authed':
    case 'token_revoked':
      return {
        code: 'AUTHENTICATION',
        userMessage: 'The Slack connection needs to be re-authorised.',
        retryable: false,
      };
    case 'channel_not_found':
    case 'not_in_channel':
      return {
        code: 'NOT_FOUND',
        userMessage: 'The bot is not in that Slack channel. Invite it and try again.',
        retryable: false,
      };
    case 'users_not_found':
      return {
        code: 'NOT_FOUND',
        userMessage: 'No Slack account is registered for that email.',
        retryable: false,
      };
    case 'ratelimited':
      return {
        code: 'RATE_LIMITED',
        userMessage: 'Slack is rate limiting us. The update will be retried automatically.',
        retryable: true,
        retryAfterMs: 30_000,
      };
    default:
      return {
        code: 'UNAVAILABLE',
        userMessage: 'Slack rejected the update. It is queued and will be retried.',
        retryable: true,
      };
  }
}
