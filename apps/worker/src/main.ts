import { createServer } from 'node:http';
import { env, loadRootEnv } from '@relay/config';
import { logger } from '@relay/observability';
import { db } from '@relay/db';
import { installSchedules, installShutdownHandlers, startWorker } from '@relay/queue/consumer';
import { processIntegration } from './processors/integrations';
import { processMaintenance } from './processors/maintenance';
import { processNotification } from './processors/notifications';

loadRootEnv();
const config = env();

logger.info(
  { env: config.APP_ENV, redis: config.REDIS_URL.replace(/\/\/.*@/, '//***@') },
  'worker starting',
);

startWorker('integrations', processIntegration, { concurrency: 5 });
startWorker('notifications', processNotification, { concurrency: 10 });
startWorker('maintenance', processMaintenance, { concurrency: 1 });

await installSchedules();

/** Liveness for the platform, plus a deep check the ops team can hit. */
const health = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, role: 'worker' }));
    return;
  }
  if (request.url === '/health/deep') {
    void db.$queryRaw`SELECT 1`
      .then(() => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, database: 'up' }));
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'deep health check failed');
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, database: 'down' }));
      });
    return;
  }
  response.writeHead(404);
  response.end();
});

health.listen(config.WORKER_HEALTH_PORT, () => {
  logger.info({ port: config.WORKER_HEALTH_PORT }, 'worker health endpoint listening');
});

installShutdownHandlers(async () => {
  health.close();
  await db.$disconnect();
});
