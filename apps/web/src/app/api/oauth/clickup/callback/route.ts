import { NextResponse } from 'next/server';
import { env } from '@relay/config';
import { exchangeClickUpCode, setOrganizationIntegration } from '@relay/integrations';
import { can } from '@relay/rbac';
import { consumeOAuthState } from '@/server/oauth';
import { getPrincipal } from '@/server/session';

/** Finishes the ClickUp "Connect" flow (D-053) - see slack/callback/route.ts for the shape. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const integrationsUrl = new URL('/integrations', env().APP_URL);

  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.redirect(new URL('/sign-in?next=/integrations', env().APP_URL));
  }

  const stateOk = await consumeOAuthState('oauth_state_clickup', url.searchParams.get('state'));
  if (!stateOk) {
    integrationsUrl.searchParams.set('oauth_error', 'clickup_state');
    return NextResponse.redirect(integrationsUrl);
  }

  if (url.searchParams.get('error')) {
    integrationsUrl.searchParams.set('oauth_error', 'clickup_denied');
    return NextResponse.redirect(integrationsUrl);
  }

  if (!can(principal, 'integration:manage') || !principal.organizationId) {
    integrationsUrl.searchParams.set('oauth_error', 'clickup_forbidden');
    return NextResponse.redirect(integrationsUrl);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    integrationsUrl.searchParams.set('oauth_error', 'clickup_no_code');
    return NextResponse.redirect(integrationsUrl);
  }

  const result = await exchangeClickUpCode({ code });
  if (!result.ok) {
    integrationsUrl.searchParams.set('oauth_error', 'clickup_exchange');
    return NextResponse.redirect(integrationsUrl);
  }

  await setOrganizationIntegration({
    organizationId: principal.organizationId,
    provider: 'CLICKUP',
    config: { apiToken: result.token },
    configuredById: principal.id,
  });

  integrationsUrl.searchParams.set('connected', 'clickup');
  return NextResponse.redirect(integrationsUrl);
}
