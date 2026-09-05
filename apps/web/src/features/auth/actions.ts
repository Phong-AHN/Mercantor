'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  revokeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  signIn as performSignIn,
} from '@relay/auth';
import { landingPathFor } from '@relay/rbac';
import { isAppError, ValidationError } from '@relay/core';
import { db } from '@relay/db';
import { logger } from '@relay/observability';
import { requestMeta } from '@/server/session';
import { actionError, type ActionResult } from '@/server/action';

const signInInput = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
});

/**
 * Sign-in is not built with `defineAction`: it is the one mutation that runs
 * without a principal, so it does its own validation and never asserts a
 * permission.
 */
export async function signInAction(_prev: unknown, form: FormData): Promise<ActionResult<never>> {
  const parsed = signInInput.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[issue.path.join('.') || '_'] ??= []).push(issue.message);
    }
    return actionError('Check the details below.', fieldErrors);
  }

  let destination: string;
  try {
    const meta = await requestMeta();
    const { session, userId } = await performSignIn(parsed.data.email, parsed.data.password, meta);

    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, sessionCookieOptions());

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, team: true, isActive: true },
    });

    const fallback = landingPathFor(user);
    // Only same-origin paths are honoured, so `?next=` cannot become an open
    // redirect to somebody else's site.
    const requested = parsed.data.next;
    destination =
      requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : fallback;
  } catch (error) {
    if (error instanceof ValidationError) {
      return actionError(error.userMessage, error.fieldErrors);
    }
    if (!isAppError(error)) logger.error({ err: error }, 'sign-in failed');
    return actionError('Sign-in could not be completed. Try again.');
  }

  // Outside the try: `redirect` works by throwing, and must not be caught.
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await revokeSession(token);
  store.delete(SESSION_COOKIE);
  redirect('/sign-in');
}
