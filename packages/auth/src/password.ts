import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt from Node's own crypto, rather than a native argon2 binding. It is a
 * memory-hard KDF, it needs no compiler on the deploy host, and the parameters
 * are stored in the hash so they can be raised later without invalidating
 * existing passwords.
 *
 * Format: `scrypt$N$r$p$<salt base64>$<hash base64>`
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const MAXMEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  assertPasswordShape(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < PARAMS.N;
}

export interface PasswordProblem {
  ok: boolean;
  problems: string[];
}

/** Length over composition rules - the guidance every modern standard gives. */
export function checkPasswordStrength(password: string): PasswordProblem {
  const problems: string[] = [];
  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 200) problems.push('Use at most 200 characters.');
  if (/^\s|\s$/.test(password)) problems.push('Remove leading or trailing spaces.');
  if (/^(.)\1+$/.test(password)) problems.push('Do not repeat a single character.');
  return { ok: problems.length === 0, problems };
}

function assertPasswordShape(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A password is required.');
  }
  if (password.length > 200) {
    // Guards against a long-string denial of service against the KDF.
    throw new Error('Password is too long.');
  }
}
