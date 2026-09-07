import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * A real regression, not a hypothetical: `retryOutbox` (apps/worker's
 * maintenance sweep) used `jobId: \`outbox:${message.id}\`` as a custom
 * BullMQ job id. BullMQ's `Job.validateOptions` rejects any custom id
 * containing `:` unless splitting on it yields exactly 3 parts - a carve-out
 * for its own `repeat:<hash>:<timestamp>` ids, not for ours. `outbox:<uuid>`
 * splits into 2, so it was always synchronously rejected before ever
 * touching Redis - `enqueue()` catches that, logs it, and returns false, so
 * every single retry sweep failed silently, forever, for any outbox message
 * that needed more than its first, immediate delivery attempt.
 *
 * This talks to a real BullMQ `Queue` against the `pnpm infra:up` Redis
 * directly (not through `@relay/queue`'s cached producer, which follows
 * whatever `REDIS_URL` happens to be configured) so the assertion holds
 * regardless of environment.
 */
describe('a custom job id used for outbox retries', () => {
  const queue = new Queue('integrations', { connection: { host: 'localhost', port: 6380 } });

  afterAll(async () => {
    await queue.close();
  });

  it('with a colon (the old `outbox:<id>` shape) is rejected before reaching Redis', async () => {
    const id = randomUUID();
    await expect(
      queue.add('integrations', { outboxId: id }, { jobId: `outbox:${id}` }),
    ).rejects.toThrow('Custom Id cannot contain :');
  });

  it('with a hyphen (the fixed `outbox-<id>` shape) is accepted', async () => {
    const id = randomUUID();
    const job = await queue.add('integrations', { outboxId: id }, { jobId: `outbox-${id}` });
    expect(job.id).toBe(`outbox-${id}`);
    // Best-effort cleanup only: a real worker in this dev environment may
    // already be consuming this same queue and lock the job first, which is
    // fine - the assertion above is what this test is proving.
    await job.remove().catch(() => {});
  });
});
