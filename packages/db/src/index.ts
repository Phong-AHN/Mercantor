import { loadRootEnv } from '@relay/config';
import { PrismaClient, Prisma } from '@prisma/client';

// Next.js loads `.env` relative to `apps/web`, and the worker relative to its
// own directory. The workspace keeps one `.env` at the root, so every process
// that touches the database reads it from the same place.
loadRootEnv();

export * from '@prisma/client';
export { Prisma };

declare global {
  var __relayPrisma: PrismaClient | undefined;
}

/**
 * One client per process. Next.js reloads modules in development, so without
 * the global the dev server exhausts the connection pool within a few edits -
 * the same guard the previous project used.
 *
 * Only this package may construct a PrismaClient; ESLint refuses
 * `@prisma/client` imports everywhere else.
 */
export const db: PrismaClient =
  globalThis.__relayPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__relayPrisma = db;
}

export type DbClient = PrismaClient;
export type DbTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Every multi-row mutation runs inside one of these. */
export function transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { timeout: 15_000 });
}

/** True when Postgres rejected the write because of a named check constraint. */
export function isCheckConstraintViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P0001' && error.code !== 'P2010' && error.code !== 'P2000') {
    // Prisma surfaces check violations through the raw driver error message.
    const message = String(error.message);
    return constraint
      ? message.includes(constraint)
      : message.includes('violates check constraint');
  }
  return true;
}

export function isUniqueViolation(error: unknown, target?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  if (!target) return true;
  const meta = error.meta as { target?: string[] | string } | undefined;
  const fields = Array.isArray(meta?.target) ? meta.target.join(',') : (meta?.target ?? '');
  return fields.includes(target);
}
