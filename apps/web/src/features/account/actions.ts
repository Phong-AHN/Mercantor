'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  checkPasswordStrength,
  consumePasswordToken,
  createPasswordToken,
  createSession,
  hashPassword,
  revokeAllSessionsForUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@relay/auth';
import { env } from '@relay/config';
import { renderPasswordResetEmail } from '@relay/core';
import { db } from '@relay/db';
import { integrations } from '@relay/integrations';
import { logger } from '@relay/observability';
import { actionError, actionOk, type ActionResult } from '@/server/action';
import { requestMeta } from '@/server/session';

/**
 * Both forms here run signed out, the same reason `signInAction` is not
 * built with `defineAction`: there is no principal yet for it to resolve.
 */

const GENERIC_RESET_MESSAGE = 'If that email has an account, a reset link is on its way.';

const requestResetInput = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .email('Enter a valid email address.'),
});

/**
 * Always the same response, whether or not the email exists - the same
 * anti-enumeration shape `signIn()` already uses for a wrong password. A
 * send failure is logged, never surfaced: telling the caller "that failed
 * to send" for an address that was never registered is itself an oracle.
 */
export async function requestPasswordResetAction(
  _prev: ActionResult<undefined> | null,
  form: FormData,
): Promise<ActionResult<undefined>> {
  const parsed = requestResetInput.safeParse({ email: form.get('email') });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[issue.path.join('.') || '_'] ??= []).push(issue.message);
    }
    return actionError('Check the details below.', fieldErrors);
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
      select: { id: true, name: true, email: true },
    });

    if (user) {
      const { token } = await createPasswordToken(user.id, 'RESET');
      const rendered = renderPasswordResetEmail({
        recipientName: user.name,
        resetUrl: `${env().APP_URL}/set-password?token=${token}`,
      });
      const result = await integrations().email.send({
        to: [{ name: user.name, email: user.email }],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      if (!result.ok) {
        logger.error(
          { userId: user.id, error: result.error },
          'password reset email failed to send',
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'requestPasswordResetAction failed');
  }

  return actionOk(undefined, GENERIC_RESET_MESSAGE);
}

const setPasswordInput = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(1, 'Choose a password.'),
});

/**
 * The one landing page for both a first-time invite and a forgotten-password
 * reset (`/set-password?token=...`) - `consumePasswordToken` does not care
 * which this token was for, only that it is genuine, unused and unexpired.
 */
export async function setPasswordAction(
  _prev: ActionResult<never> | null,
  form: FormData,
): Promise<ActionResult<never>> {
  const parsed = setPasswordInput.safeParse({
    token: form.get('token'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    return actionError('That link is missing something. Request a new one.');
  }

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) {
    return actionError('Choose a stronger password.', { password: strength.problems });
  }

  const consumed = await consumePasswordToken(parsed.data.token);
  if (!consumed) {
    return actionError('That link has expired or was already used. Request a new one.');
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.update({
    where: { id: consumed.userId },
    data: { passwordHash, isActive: true },
  });
  // A reset invalidates every other session, in case the account was
  // compromised; an invite has none yet to revoke, so this is a no-op there.
  await revokeAllSessionsForUser(consumed.userId);

  const meta = await requestMeta();
  const session = await createSession(consumed.userId, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, sessionCookieOptions());

  redirect('/');
}
