import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against the real Postgres started by `pnpm infra:up` -
 * no mocked Prisma client, no fixtures standing in for the database. They call
 * the actual exported server actions, the same functions the UI calls, with
 * `next/headers` and `next/cache` stubbed to work outside a request (see
 * `test/integration-setup.ts`).
 *
 * `fileParallelism: false` because every file shares one database; each file
 * still picks its own UUID-prefixed fixtures so they cannot collide.
 */
export default defineConfig({
  test: {
    include: [
      'apps/web/src/**/*.integration.test.ts',
      'apps/worker/src/**/*.integration.test.ts',
      'packages/**/src/**/*.integration.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    environment: 'node',
    globals: false,
    fileParallelism: false,
    setupFiles: ['./apps/web/test/integration-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
  },
});
