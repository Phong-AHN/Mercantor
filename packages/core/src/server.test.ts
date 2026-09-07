import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './server';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext value', () => {
    const encrypted = encryptSecret('xoxb-real-slack-token', KEY);
    expect(decryptSecret(encrypted, KEY)).toBe('xoxb-real-slack-token');
  });

  it('never stores the plaintext in the encoded value', () => {
    const encrypted = encryptSecret('xoxb-super-secret', KEY);
    expect(encrypted).not.toContain('xoxb-super-secret');
  });

  it('the same plaintext encrypts differently each time - a fresh IV every call', () => {
    const first = encryptSecret('same input', KEY);
    const second = encryptSecret('same input', KEY);
    expect(first).not.toBe(second);
    expect(decryptSecret(first, KEY)).toBe('same input');
    expect(decryptSecret(second, KEY)).toBe('same input');
  });

  it('refuses to decrypt with the wrong key rather than returning garbage', () => {
    const encrypted = encryptSecret('a real credential', KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('refuses a tampered ciphertext - GCM catches the corruption, not silent wrong output', () => {
    const encrypted = encryptSecret('a real credential', KEY);
    const [iv, authTag, ciphertext] = encrypted.split(':');
    const tampered = [iv, authTag, `${ciphertext!.slice(0, -4)}AAAA`].join(':');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('refuses a malformed blob', () => {
    expect(() => decryptSecret('not-a-real-encrypted-value', KEY)).toThrow(/malformed/i);
  });
});
