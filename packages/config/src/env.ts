import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as parseDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Walks up from the current working directory looking for `pnpm-workspace.yaml`
 * and loads the `.env` that sits beside it. Never overwrites a variable that is
 * already set, and skips entirely in production where the platform supplies
 * real environment variables.
 *
 * Inherited verbatim in behaviour from AHN Orbit's `loadRootEnv`.
 */
export function loadRootEnv(): void {
  if (process.env.NODE_ENV === 'production') return;

  let dir = resolve(process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const envPath = join(dir, '.env');
      if (existsSync(envPath)) {
        parseDotenv({ path: envPath, override: false, quiet: true });
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

const base64Key = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => Buffer.from(v, 'base64').length >= 24, {
      message: `${label} must decode to at least 24 bytes of base64`,
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6380'),

  SESSION_SIGNING_SECRET: base64Key('SESSION_SIGNING_SECRET'),
  CREDENTIAL_ENCRYPTION_KEY: base64Key('CREDENTIAL_ENCRYPTION_KEY'),

  S3_BUCKET: z.string().default('relay-media-dev'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(false),

  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  CLICKUP_API_TOKEN: z.string().optional(),
  CLICKUP_TEAM_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('AHN Migration Portal <portal@ahnmedia.example>'),

  // Platform-level OAuth apps (D-053) - one registration for the whole
  // deployment, not per organization. An organization's own admin then
  // "Connect"s Slack/ClickUp through the browser rather than ever handling
  // a token - see `packages/integrations/src/oauth.ts`. Absent means the
  // Connect button is hidden and the manual-token form is the only path,
  // the same fallback every organization already has.
  SLACK_OAUTH_CLIENT_ID: z.string().optional(),
  SLACK_OAUTH_CLIENT_SECRET: z.string().optional(),
  CLICKUP_OAUTH_CLIENT_ID: z.string().optional(),
  CLICKUP_OAUTH_CLIENT_SECRET: z.string().optional(),

  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3100),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Validated environment. Throws once, at first access, with every problem
 * listed - a missing secret fails the boot rather than the first request that
 * happens to need it.
 */
export function env(): Env {
  if (cached) return cached;

  loadRootEnv();

  if (process.env.SKIP_ENV_VALIDATION === 'true') {
    cached = schema.parse({
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://relay:relay@localhost:5433/relay',
      SESSION_SIGNING_SECRET:
        process.env.SESSION_SIGNING_SECRET ?? Buffer.alloc(32, 1).toString('base64'),
      CREDENTIAL_ENCRYPTION_KEY:
        process.env.CREDENTIAL_ENCRYPTION_KEY ?? Buffer.alloc(32, 2).toString('base64'),
    });
    return cached;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test hook. Not exported from the package barrel on purpose. */
export function __resetEnvCacheForTests(): void {
  cached = null;
}

/** Reads a file only if it exists - used by container secret mounts. */
export function readSecretFile(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : undefined;
}
