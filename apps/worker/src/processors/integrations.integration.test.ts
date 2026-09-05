import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearMockDeliveries, mockDeliveries } from '@relay/integrations';
import { db } from '@relay/db';
import { processIntegration } from './integrations';

/**
 * D-039: an urgent notification also DMs the recipient in Slack, resolved
 * fresh by email at delivery time (`findUserByEmail`) rather than a stored
 * id - nothing about Slack identity is ever queued. No `SLACK_BOT_TOKEN` in
 * the test environment, so this runs through the mock adapter, the same way
 * every other integration test exercises a provider without live
 * credentials; what it proves is real either way - the outbox row reaches
 * `DELIVERED`, and the lookup ran against the actual email on the row, not
 * a stub of the whole delivery path.
 */
describe('Slack DM delivery for urgent notifications', () => {
  afterEach(() => {
    clearMockDeliveries();
  });

  it('resolves the recipient by email and delivers the DM', async () => {
    const email = `dm-${randomUUID().slice(0, 8)}@relay.test`;
    const row = await db.outboxMessage.create({
      data: {
        provider: 'SLACK',
        kind: 'notification_dm',
        payload: {
          email,
          title: 'A launch blocker on Sunrise Coffee',
          body: 'Checkout is down.',
        },
      },
      select: { id: true },
    });

    try {
      await processIntegration({ outboxId: row.id });

      const after = await db.outboxMessage.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.status).toBe('DELIVERED');
      expect(after.lastError).toBeNull();

      const deliveries = mockDeliveries();
      const lookup = deliveries.find((d) => d.kind === 'find_user_by_email');
      const post = deliveries.find((d) => d.kind === 'post_update');

      expect((lookup?.payload as { email: string } | undefined)?.email).toBe(email);
      expect(
        (post?.payload as { destination: { channelId: string } } | undefined)?.destination
          .channelId,
      ).toBe(`mock-U${email.replace(/[^a-z0-9]/gi, '')}`);
    } finally {
      await db.outboxMessage.delete({ where: { id: row.id } });
    }
  });
});
