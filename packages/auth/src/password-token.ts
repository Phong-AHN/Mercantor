import { clock } from '@relay/core';
import { hashToken, randomToken } from '@relay/core/server';
import { db } from '@relay/db';
import type { PasswordTokenPurpose } from '@relay/db';

/**
 * One table, two doors in: `INVITE` (a person set a password for the first
 * time, from `inviteUserAction`/`inviteMerchantAction`) and `RESET` (a
 * person forgot theirs). Same shape `Session` already uses - the raw token
 * exists only in the email it was sent in, the database keeps only its
 * SHA-256, and it is single-use and short-lived either way.
 */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export function ttlForPurpose(purpose: PasswordTokenPurpose): number {
  return purpose === 'INVITE' ? INVITE_TTL_MS : RESET_TTL_MS;
}

export interface IssuedPasswordToken {
  token: string;
  expiresAt: Date;
}

export async function createPasswordToken(
  userId: string,
  purpose: PasswordTokenPurpose,
): Promise<IssuedPasswordToken> {
  const token = randomToken(32);
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + ttlForPurpose(purpose));

  await db.passwordToken.create({
    data: { userId, purpose, tokenHash: hashToken(token), expiresAt, createdAt: now },
  });

  return { token, expiresAt };
}

export interface ConsumedPasswordToken {
  userId: string;
  purpose: PasswordTokenPurpose;
}

/**
 * Looks a raw token up, checks it is unused and unexpired, and marks it used
 * - all inside one call, so two concurrent requests with the same link
 * cannot both succeed. Not filtered by purpose: the one `/set-password` page
 * accepts either kind of token and does not need to know up front which one
 * it was handed, only what it turns out to be once consumed (an `INVITE`
 * leaves no prior session to revoke; a `RESET` does). Returns `null` for
 * anything wrong rather than distinguishing "expired" from "already used"
 * from "never existed" - a token in a link nobody legitimately sent 404s the
 * same generic way every other not-found case in this app does.
 */
export async function consumePasswordToken(
  rawToken: string,
): Promise<ConsumedPasswordToken | null> {
  const now = clock.now();
  const tokenHash = hashToken(rawToken);

  const result = await db.passwordToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (result.count === 0) return null;

  const row = await db.passwordToken.findUniqueOrThrow({
    where: { tokenHash },
    select: { userId: true, purpose: true },
  });
  return row;
}
