import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { resolveSession, SESSION_COOKIE, type ResolvedSession } from '@relay/auth';
import { UnauthenticatedError } from '@relay/core';
import type { Principal } from '@relay/rbac';

/**
 * One session resolution per request, shared by the layout and every page and
 * server action inside it. `cache` is React's request-scoped memo, so this is
 * one database round trip no matter how many components ask.
 */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

export async function getPrincipal(): Promise<Principal | null> {
  return (await getSession())?.principal ?? null;
}

/** For server actions and route handlers: throws rather than redirecting. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new UnauthenticatedError();
  return principal;
}

/** For pages: sends the visitor to sign-in, remembering where they were. */
export async function requirePrincipalOrRedirect(returnTo?: string): Promise<Principal> {
  const principal = await getPrincipal();
  if (principal) return principal;
  const target = returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : '/sign-in';
  redirect(target);
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  return {
    ip: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : null,
    userAgent: list.get('user-agent'),
  };
}
