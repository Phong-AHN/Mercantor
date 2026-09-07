import { NextResponse } from 'next/server';
import { env } from '@relay/config';
import { exchangeSlackCode, setOrganizationIntegration } from '@relay/integrations';
import { can } from '@relay/rbac';
import { consumeOAuthState } from '@/server/oauth';
import { getPrincipal } from '@/server/session';

/**
 * Finishes the Slack "Connect" flow (D-053). Every rejection lands back on
 * `/integrations` with `oauth_error` set to something the page can turn
 * into a plain-language message - never a bare JSON error, since nothing
 * about this leg of the flow is an API call a client made on purpose.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const integrationsUrl = new URL('/integrations', env().APP_URL);

  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.redirect(new URL('/sign-in?next=/integrations', env().APP_URL));
  }

  const stateOk = await consumeOAuthState('oauth_state_slack', url.searchParams.get('state'));
  if (!stateOk) {
    integrationsUrl.searchParams.set('oauth_error', 'slack_state');
    return NextResponse.redirect(integrationsUrl);
  }

  if (url.searchParams.get('error')) {
    integrationsUrl.searchParams.set('oauth_error', 'slack_denied');
    return NextResponse.redirect(integrationsUrl);
  }

  if (!can(principal, 'integration:manage') || !principal.organizationId) {
    integrationsUrl.searchParams.set('oauth_error', 'slack_forbidden');
    return NextResponse.redirect(integrationsUrl);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    integrationsUrl.searchParams.set('oauth_error', 'slack_no_code');
    return NextResponse.redirect(integrationsUrl);
  }

  const result = await exchangeSlackCode({
    code,
    redirectUri: `${env().APP_URL}/api/oauth/slack/callback`,
  });
  if (!result.ok) {
    integrationsUrl.searchParams.set('oauth_error', 'slack_exchange');
    return NextResponse.redirect(integrationsUrl);
  }

  await setOrganizationIntegration({
    organizationId: principal.organizationId,
    provider: 'SLACK',
    config: { botToken: result.token },
    configuredById: principal.id,
  });

  integrationsUrl.searchParams.set('connected', 'slack');
  return NextResponse.redirect(integrationsUrl);
}
