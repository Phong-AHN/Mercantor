import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Node-only helpers. Kept out of the package barrel on purpose: importing
 * `node:crypto` from a `'use client'` component typechecks and then fails the
 * production build, which is exactly the trap the previous project documented.
 */

/** URL-safe opaque token. Used for session ids and merchant invite links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Sessions are stored hashed, so a database read cannot be replayed as a login.
 * SHA-256 is right here (unlike for passwords) because the input is already
 * 256 bits of entropy and lookup must stay indexable.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/** `PRJ-0042` - short, sortable, and safe to say out loud on a call. */
export function projectCode(sequence: number): string {
  return `PRJ-${String(sequence).padStart(4, '0')}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
