import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@relay/config';
import { logger } from '@relay/observability';
import { DEFAULT_JOB_OPTIONS, QUEUE_PAYLOAD, type QueueName, type QueuePayloads } from './queues';

/**
 * The producer half. `apps/web` imports only this file - ESLint refuses the
 * consumer import from the web app, and the consumer refuses to start unless
 * `RELAY_ROLE=worker`. The app produces jobs; it never consumes them.
 */

let connection: Redis | null = null;
const queues = new Map<QueueName, Queue>();

/** A non-blocking connection. Only the worker may hold a blocking one. */
export function producerConnection(): Redis {
  const existing = connection;
  if (existing) return existing;

  const created = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  created.on('error', (error) => logger.error({ err: error }, 'redis producer error'));
  connection = created;
  return created;
}

export function queue<T extends QueueName>(name: T): Queue<QueuePayloads[T]> {
  const existing = queues.get(name);
  if (existing) return existing as Queue<QueuePayloads[T]>;

  const created = new Queue(name, {
    connection: producerConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  queues.set(name, created);
  return created as Queue<QueuePayloads[T]>;
}

/**
 * Enqueue with the payload validated on the way in. Redis being unreachable
 * must never fail the user's request: the database write already happened and
 * the outbox row survives, so a failure here is logged and swallowed.
 */
export async function enqueue<T extends QueueName>(
  name: T,
  payload: QueuePayloads[T],
  options: { jobId?: string; delayMs?: number } = {},
): Promise<boolean> {
  const parsed = QUEUE_PAYLOAD[name].safeParse(payload);
  if (!parsed.success) {
    logger.error(
      { queue: name, issues: parsed.error.issues },
      'refused to enqueue invalid payload',
    );
    return false;
  }

  try {
    await (queue(name) as Queue).add(name, parsed.data, {
      jobId: options.jobId,
      delay: options.delayMs,
    });
    return true;
  } catch (error) {
    logger.error({ err: error, queue: name }, 'enqueue failed - the outbox row will be retried');
    return false;
  }
}

export async function closeProducer(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  await connection?.quit();
  connection = null;
}
