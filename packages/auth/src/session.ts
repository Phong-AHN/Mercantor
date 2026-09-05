import { clock, UnauthenticatedError, USER_ROLE_TEAM } from '@relay/core';
import { hashToken, randomToken } from '@relay/core/server';
import { db } from '@relay/db';
import type { Principal } from '@relay/rbac';

export const SESSION_COOKIE = 'relay_session';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Re-issued rather than extended, so a stolen cookie still expires. */
const SLIDING_REFRESH_MS = 24 * 60 * 60 * 1000;

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

export function sessionCookieOptions(maxAgeMs = SESSION_TTL_MS): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/**
 * The raw token is returned once, to be put in the cookie, and never stored.
 * The database keeps only its SHA-256, so a database read cannot be replayed
 * as a login.
 */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssuedSession> {
  const token = randomToken(32);
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      createdAt: now,
      lastSeenAt: now,
    },
  });

  return { token, expiresAt };
}

export interface ResolvedSession {
  principal: Principal;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Resolves a cookie to a principal. The role is read from Postgres on every
 * request - never from the cookie - so a revoked or downgraded account loses
 * access immediately rather than at the next sign-in.
 */
export async function resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
  if (!token) return null;

  const now = clock.now();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          team: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= now.getTime()) return null;
  if (!session.user.isActive || session.user.deletedAt !== null) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > SLIDING_REFRESH_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    principal: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      // The role is authoritative; the column is a denormalised convenience.
      team: USER_ROLE_TEAM[session.user.role] ?? session.user.team,
      isActive: session.user.isActive,
    },
  };
}

export async function requireSession(token: string | undefined): Promise<ResolvedSession> {
  const session = await resolveSession(token);
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

/** Used when a password changes or an account is deactivated. */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
  return result.count;
}

/** Housekeeping for the nightly maintenance job. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: clock.now() } },
  });
  return result.count;
}
