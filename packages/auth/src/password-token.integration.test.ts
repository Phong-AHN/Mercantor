import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@relay/db';
import { consumePasswordToken, createPasswordToken } from './password-token';

async function makeUser(): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `it-token-${randomUUID().slice(0, 8)}@relay.test`,
      name: 'Token Test User',
      passwordHash: 'scrypt$1$1$1$dW51c2Vk$dW51c2Vk',
      role: 'AHN_DEVELOPER',
      team: 'AHN',
      isActive: true,
    },
  });
  return user.id;
}

describe('password tokens', () => {
  const userIds: string[] = [];

  afterEach(async () => {
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  it('a fresh token consumes exactly once, and carries the right purpose', async () => {
    const userId = await makeUser();
    userIds.push(userId);

    const { token } = await createPasswordToken(userId, 'INVITE');
    const consumed = await consumePasswordToken(token);
    expect(consumed).toEqual({ userId, purpose: 'INVITE' });

    const reused = await consumePasswordToken(token);
    expect(reused).toBeNull();
  });

  it('an expired token is refused even though it was never used', async () => {
    const userId = await makeUser();
    userIds.push(userId);

    const { token } = await createPasswordToken(userId, 'RESET');
    // Backdate it past its own TTL rather than waiting an hour.
    await db.passwordToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await consumePasswordToken(token)).toBeNull();
  });

  it('a token nobody issued is refused, not a database error', async () => {
    expect(await consumePasswordToken('not-a-real-token')).toBeNull();
  });

  it('an INVITE token outlives a RESET token - a week to set up an account, an hour to recover one', async () => {
    const userId = await makeUser();
    userIds.push(userId);

    const invite = await createPasswordToken(userId, 'INVITE');
    const reset = await createPasswordToken(userId, 'RESET');
    expect(invite.expiresAt.getTime()).toBeGreaterThan(reset.expiresAt.getTime());
  });
});
