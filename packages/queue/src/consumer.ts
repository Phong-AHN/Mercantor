import { Worker, type Job, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@relay/config';
import { logger, newCorrelationId, withCorrelationId } from '@relay/observability';
import { MAINTENANCE_SCHEDULE, QUEUE_PAYLOAD, type QueueName, type QueuePayloads } from './queues';
import { queue } from './producer';

/**
 * The consumer half. Importing this file from the web app is a lint error, and
 * calling `startWorker` outside the worker process throws - a long-lived
 * blocking Redis connection has no business inside a request handler.
 */
export function assertWorkerProcess(): void {
  if (process.env.RELAY_ROLE !== 'worker') {
    throw new Error(
      'Queue consumers may only run in the worker process. Set RELAY_ROLE=worker before importing @relay/queue/consumer.',
    );
  }
}

let blocking: Redis | null = null;

function blockingConnection(): Redis {
  assertWorkerProcess();
  const existing = blocking;
  if (existing) return existing;

  const created = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  created.on('error', (error) => logger.error({ err: error }, 'redis consumer error'));
  blocking = created;
  return created;
}

const workers: Worker[] = [];

export interface WorkerOptions {
  concurrency?: number;
}

export function startWorker<T extends QueueName>(
  name: T,
  handler: (payload: QueuePayloads[T], job: Job) => Promise<void>,
  options: WorkerOptions = {},
): Worker {
  assertWorkerProcess();

  const processor: Processor = async (job) => {
    const parsed = QUEUE_PAYLOAD[name].safeParse(job.data);
    if (!parsed.success) {
      // A malformed payload is never retried - retrying cannot fix it.
      logger.error({ queue: name, jobId: job.id, issues: parsed.error.issues }, 'invalid payload');
      return;
    }
    const payload = parsed.data as QueuePayloads[T];
    const correlationId =
      (payload as { correlationId?: string }).correlationId ?? newCorrelationId();

    await withCorrelationId(correlationId, async () => {
      const started = Date.now();
      try {
        await handler(payload, job);
        logger.info({ queue: name, jobId: job.id, ms: Date.now() - started }, 'job complete');
      } catch (error) {
        logger.error(
          { err: error, queue: name, jobId: job.id, attempt: job.attemptsMade + 1 },
          'job failed',
        );
        throw error;
      }
    });
  };

  const worker = new Worker(name, processor, {
    connection: blockingConnection(),
    concurrency: options.concurrency ?? 5,
  });

  worker.on('failed', (job, error) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      logger.error({ queue: name, jobId: job.id, err: error }, 'job exhausted its attempts');
    }
  });

  workers.push(worker);
  return worker;
}

/** Installs the repeatable maintenance schedule. Idempotent by job key. */
export async function installSchedules(): Promise<void> {
  assertWorkerProcess();
  const maintenance = queue('maintenance');
  for (const entry of MAINTENANCE_SCHEDULE) {
    await maintenance.add(
      'maintenance',
      { task: entry.task },
      {
        repeat: { pattern: entry.pattern },
        jobId: `schedule:${entry.task}`,
      },
    );
  }
  logger.info({ count: MAINTENANCE_SCHEDULE.length }, 'maintenance schedules installed');
}

export function installShutdownHandlers(onClose?: () => Promise<void>): void {
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down worker');
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await onClose?.();
    await blocking?.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
