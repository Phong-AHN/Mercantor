import { describe, expect, it } from 'vitest';
import { checkPasswordStrength, hashPassword, needsRehash, verifyPassword } from './password';

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
  });

  it('salts, so two hashes of the same password differ', async () => {
    const a = await hashPassword('the same password twice');
    const b = await hashPassword('the same password twice');
    expect(a).not.toBe(b);
  });

  it('never throws on a malformed stored hash', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$a$b$c$d$e')).toBe(false);
  });

  it('flags hashes made with weaker parameters', async () => {
    expect(needsRehash('scrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(true);
    expect(needsRehash(await hashPassword('a strong enough password'))).toBe(false);
  });
});

describe('checkPasswordStrength', () => {
  it('asks for length rather than character classes', () => {
    expect(checkPasswordStrength('short').ok).toBe(false);
    expect(checkPasswordStrength('a reasonably long passphrase').ok).toBe(true);
    expect(checkPasswordStrength('aaaaaaaaaaaaaaaa').ok).toBe(false);
  });
});
