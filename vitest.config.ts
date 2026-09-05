import { defineConfig } from 'vitest/config';

/**
 * Unit tests only - no infrastructure, no `next/headers` mocking, no `@`
 * alias. `*.integration.test.ts` needs all three (see
 * `vitest.integration.config.ts`) and has to be excluded explicitly here:
 * `*.test.ts` as a suffix glob also matches `*.integration.test.ts`, so
 * without the exclusion this config would pick the integration files up and
 * fail to load them rather than skip them.
 */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/*.integration.test.ts'],
    environment: 'node',
    globals: false,
  },
});
