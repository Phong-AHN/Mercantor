import { NextResponse } from 'next/server';
import { env } from '@relay/config';
import { slackAuthorizeUrl, slackOAuthConfigured } from '@relay/integrations';
import { can } from '@relay/rbac';
import { beginOAuthState } from '@/server/oauth';
import { getPrincipal } from '@/server/session';

/**
 * Starts the Slack "Connect" flow (D-053) - a plain-navigation GET, not a
 * server action, since the next hop is a redirect to Slack's own consent
 * screen, not a form submission this app can render a result for itself.
 */
export async function GET() {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.redirect(new URL('/sign-in?next=/integrations', env().APP_URL));
  }
  if (
    !can(principal, 'integration:manage') ||
    !principal.organizationId ||
    !slackOAuthConfigured()
  ) {
    return NextResponse.redirect(new URL('/integrations', env().APP_URL));
  }

  const state = await beginOAuthState('oauth_state_slack');
  const redirectUri = `${env().APP_URL}/api/oauth/slack/callback`;
  return NextResponse.redirect(slackAuthorizeUrl({ redirectUri, state }));
}
