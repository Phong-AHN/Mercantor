import pino, { type Logger } from 'pino';
import { currentCorrelationId } from './correlation';
import { REDACT_PATHS } from './redaction';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * `pino-pretty` runs in a worker thread, and Next.js bundles server code into
 * `.next/server`, where that worker cannot resolve its own entry point. So the
 * pretty transport is only used by standalone Node processes - the web app logs
 * newline-delimited JSON, which is what a hosting platform wants anyway.
 */
const canUsePrettyTransport = isDev && process.env.NEXT_RUNTIME === undefined;

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    service: process.env.RELAY_SERVICE ?? 'web',
    role: process.env.RELAY_ROLE ?? 'web',
    env: process.env.APP_ENV ?? 'development',
  },
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  mixin() {
    const correlationId = currentCorrelationId();
    return correlationId ? { correlationId } : {};
  },
  transport: canUsePrettyTransport
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

/**
 * Deliberately no eager `env()` call here. A build runs with
 * NODE_ENV=production and no real secrets, so validating at import time turns
 * every build into a deployment. Processes that need the configuration
 * validate it themselves at boot: see `apps/worker/src/main.ts`.
 */
