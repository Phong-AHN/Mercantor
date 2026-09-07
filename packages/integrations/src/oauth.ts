import { env } from '@relay/config';

/**
 * Platform-level OAuth "Connect" flows (D-053) - the alternative to pasting a
 * bot token by hand. AHN registers one Slack app and one ClickUp app for the
 * whole deployment (`SLACK_OAUTH_CLIENT_ID`/`CLICKUP_OAUTH_CLIENT_ID` and
 * their secrets); an organization's own admin then authorizes it from
 * Slack's or ClickUp's own consent screen, never seeing or copying a token.
 * The route handlers that drive the redirect and the state cookie live in
 * `apps/web/src/app/api/oauth/*` - this module only knows how to build the
 * authorize URL and exchange a `code` for a token, the same shape
 * `slack.ts`/`clickup.ts` already use for every other live provider call
 * (an 8-second bound, D-044's reasoning, so a slow provider cannot hang the
 * callback either).
 */

const REQUEST_TIMEOUT_MS = 8_000;

// Matches TODO.md's documented Slack app scopes exactly - `chat:write` to
// post, `channels:read`/`groups:read`/`mpim:read`/`im:read`/
// `channels:history` to import a message back (`fetchMessage`) across every
// conversation kind, `users:read.email` to resolve a personal DM by work
// email (`findUserByEmail`).
const SLACK_BOT_SCOPES =
  'chat:write,channels:read,groups:read,mpim:read,im:read,channels:history,users:read.email';

export function slackOAuthConfigured(): boolean {
  const e = env();
  return Boolean(e.SLACK_OAUTH_CLIENT_ID && e.SLACK_OAUTH_CLIENT_SECRET);
}

export function clickUpOAuthConfigured(): boolean {
  const e = env();
  return Boolean(e.CLICKUP_OAUTH_CLIENT_ID && e.CLICKUP_OAUTH_CLIENT_SECRET);
}

export function slackAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env().SLACK_OAUTH_CLIENT_ID ?? '');
  url.searchParams.set('scope', SLACK_BOT_SCOPES);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  return url.toString();
}

export function clickUpAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL('https://app.clickup.com/api');
  url.searchParams.set('client_id', env().CLICKUP_OAUTH_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  return url.toString();
}

export type OAuthExchangeResult =
  { ok: true; token: string; label?: string } | { ok: false; error: string };

/**
 * `oauth.v2.access` - the token exchange behind Slack's OAuth v2 flow.
 * `redirect_uri` must be byte-for-byte the same value used to build the
 * authorize URL, or Slack refuses the exchange.
 */
export async function exchangeSlackCode(params: {
  code: string;
  redirectUri: string;
}): Promise<OAuthExchangeResult> {
  const e = env();
  let response: Response;
  try {
    response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: e.SLACK_OAUTH_CLIENT_ID ?? '',
        client_secret: e.SLACK_OAUTH_CLIENT_SECRET ?? '',
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    return { ok: false, error: `Could not reach Slack: ${String(cause)}` };
  }

  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    access_token?: string;
    team?: { name?: string };
    error?: string;
  } | null;

  if (!data?.ok || !data.access_token) {
    return { ok: false, error: data?.error ?? 'Slack refused the authorization.' };
  }
  return { ok: true, token: data.access_token, label: data.team?.name };
}

/**
 * ClickUp's token endpoint takes `client_id`/`client_secret`/`code` as query
 * parameters on the POST itself (no request body) - matches ClickUp's own
 * documented example rather than a form-encoded body, which its API does
 * not accept here.
 */
export async function exchangeClickUpCode(params: { code: string }): Promise<OAuthExchangeResult> {
  const e = env();
  const url = new URL('https://api.clickup.com/api/v2/oauth/token');
  url.searchParams.set('client_id', e.CLICKUP_OAUTH_CLIENT_ID ?? '');
  url.searchParams.set('client_secret', e.CLICKUP_OAUTH_CLIENT_SECRET ?? '');
  url.searchParams.set('code', params.code);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    return { ok: false, error: `Could not reach ClickUp: ${String(cause)}` };
  }

  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    err?: string;
    error?: string;
  } | null;

  if (!data?.access_token) {
    return { ok: false, error: data?.err ?? data?.error ?? 'ClickUp refused the authorization.' };
  }
  return { ok: true, token: data.access_token };
}
