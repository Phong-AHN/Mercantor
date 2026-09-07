import { NextResponse } from 'next/server';
import { env } from '@relay/config';
import { clickUpAuthorizeUrl, clickUpOAuthConfigured } from '@relay/integrations';
import { can } from '@relay/rbac';
import { beginOAuthState } from '@/server/oauth';
import { getPrincipal } from '@/server/session';

/** Starts the ClickUp "Connect" flow (D-053) - see slack/start/route.ts for the shape. */
export async function GET() {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.redirect(new URL('/sign-in?next=/integrations', env().APP_URL));
  }
  if (
    !can(principal, 'integration:manage') ||
    !principal.organizationId ||
    !clickUpOAuthConfigured()
  ) {
    return NextResponse.redirect(new URL('/integrations', env().APP_URL));
  }

  const state = await beginOAuthState('oauth_state_clickup');
  const redirectUri = `${env().APP_URL}/api/oauth/clickup/callback`;
  return NextResponse.redirect(clickUpAuthorizeUrl({ redirectUri, state }));
}
