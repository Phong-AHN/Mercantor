import { clock, ValidationError } from '@relay/core';
import { db } from '@relay/db';
import { createSession, type IssuedSession } from './session';
import { hashPassword, needsRehash, verifyPassword } from './password';

/**
 * A single generic failure message for every reason a sign-in can fail -
 * unknown address, wrong password, deactivated account. Telling an attacker
 * which of the three it was is an account-enumeration oracle.
 */
const GENERIC_FAILURE = 'That email and password combination is not recognised.';

/** Burnt on a miss so a missing account is not measurably faster than a hit. */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'Ym9ndXMtaGFzaC11c2VkLW9ubHktdG8tZXF1YWxpc2UtdGltaW5nLW5ldmVyLW1hdGNoZXM=';

export interface SignInResult {
  session: IssuedSession;
  userId: string;
}

export async function signIn(
  emailInput: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SignInResult> {
  const email = emailInput.trim().toLowerCase();

  const user = await db.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, passwordHash: true, isActive: true },
  });

  const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches || !user.isActive) {
    throw new ValidationError(GENERIC_FAILURE, { email: [GENERIC_FAILURE] });
  }

  if (needsRehash(user.passwordHash)) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: clock.now() } });

  return { session: await createSession(user.id, meta), userId: user.id };
}
