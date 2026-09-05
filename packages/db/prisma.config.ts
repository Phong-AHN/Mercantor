import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { loadRootEnv } from '@relay/config';

// The Prisma CLI runs with `packages/db` as its cwd, so it would otherwise miss
// the workspace-root `.env` that every other process reads.
loadRootEnv();
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
