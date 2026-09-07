import 'server-only';
import { cookies } from 'next/headers';
import { randomToken, safeEquals } from '@relay/core/server';

/**
 * The anti-CSRF half of the OAuth "Connect" flow (D-053) - a random value
 * set in a short-lived, `httpOnly` cookie when the flow starts and compared
 * against Slack's/ClickUp's own `state` query param when it returns. Kept
 * server-side rather than carrying anything in the state value itself (no
 * organization id, no signature to verify) - the callback re-derives the
 * organization from the signed-in session at that point anyway, so the
 * state's only job is proving the redirect came from a flow this browser
 * actually started.
 */
const STATE_MAX_AGE_SECONDS = 600;

export async function beginOAuthState(cookieName: string): Promise<string> {
  const state = randomToken(24);
  const store = await cookies();
  store.set(cookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/oauth',
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return state;
}

/** Always deletes the cookie, whether or not it matched - a state is single-use either way. */
export async function consumeOAuthState(
  cookieName: string,
  received: string | null,
): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(cookieName)?.value;
  store.delete(cookieName);
  if (!expected || !received) return false;
  return safeEquals(expected, received);
}
