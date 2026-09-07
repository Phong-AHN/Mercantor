import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

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

/**
 * AES-256-GCM, keyed by `CREDENTIAL_ENCRYPTION_KEY` (the caller's job to
 * supply - this package stays free of `@relay/config` per D-004's boundary,
 * so it takes the key as a plain base64 string rather than reading `env()`
 * itself). Used for `OrganizationIntegration.encryptedConfig`: every
 * organization's own Slack/ClickUp/Resend credentials, stored per-tenant
 * instead of in one shared process-wide `.env`.
 *
 * A fresh random IV every call, GCM's own auth tag carried alongside the
 * ciphertext (so a tampered or truncated blob fails to decrypt loudly
 * rather than producing silently-wrong plaintext), all three joined as
 * `iv:authTag:ciphertext` - each segment independently base64, `:` never
 * appears inside a base64 alphabet so splitting is unambiguous.
 */
export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64').subarray(0, 32);
  const iv = randomBytes(12); // GCM's recommended IV length
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    ':',
  );
}

/** Throws if the blob is malformed or the key is wrong - never returns garbage. */
export function decryptSecret(encoded: string, keyBase64: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted value.');
  }
  const key = Buffer.from(keyBase64, 'base64').subarray(0, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
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
