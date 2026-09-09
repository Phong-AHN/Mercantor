import { defineRailway, github, preserve, project, service } from 'railway/iac';

/**
 * Only `apps/worker` lives here - `apps/web` stays on Vercel, per the
 * project's actual hosting split. Railway IaC is one file per *environment*,
 * so this is deliberately the whole thing, not a partial: adding a second
 * resource here later (a second Railway-hosted service, a managed database)
 * is one more entry in `resources`, not a second file.
 *
 * Why no `build`/`start` fields: those select Railway's Railpack/Nixpacks
 * builder, which does not know how to build a workspace package with a
 * hand-written Dockerfile (`infra/Dockerfile.worker` `COPY`s the *whole*
 * monorepo - `pnpm-workspace.yaml`, every `package.json`, before installing).
 * `RAILWAY_DOCKERFILE_PATH` below points Railway at that Dockerfile instead;
 * its own `CMD` already starts the worker, so there is no separate start
 * command to declare.
 *
 * Why no `rootDirectory`: it must stay unset (repo root as build context) -
 * the Dockerfile's `COPY` paths are relative to the repo root, not to
 * `apps/worker`, so scoping the source to that subdirectory would make every
 * one of those `COPY` lines fail.
 *
 * Why no `domains`: the worker never receives inbound HTTP from anywhere but
 * Railway's own healthcheck, which reaches it over the private network on
 * the port `infra/Dockerfile.worker`'s `EXPOSE 3100` already declares -
 * omitting `domains` entirely is how you get no public URL for it.
 *
 * Why `PORT: '3100'` is set explicitly even though nothing in this app reads
 * `process.env.PORT` (it reads `WORKER_HEALTH_PORT` instead): confirmed live
 * - the app was genuinely up (`worker health endpoint listening`, then
 * processed and logged a job failure without crashing) while every
 * healthcheck attempt still reported "service unavailable" for the entire
 * retry window. Railway's own healthcheck prober needs `PORT` to know which
 * container port to probe when a service doesn't use Railway's usual
 * convention of binding to whatever `$PORT` it is handed - without it,
 * Railway has no way to learn the target port on its own, `EXPOSE` in the
 * Dockerfile notwithstanding.
 *
 * Every secret below is `preserve()` - it tells Railway "this variable is
 * managed on the dashboard, don't overwrite it from this file" rather than
 * writing the real value into a file this repo commits to GitHub. Set the
 * actual values once, either in the Railway dashboard's Variables tab or
 * with `railway variables set KEY=value` per variable, *before* the first
 * `railway config apply` - `preserve()` has nothing to preserve on a
 * variable that has never been set.
 */
export default defineRailway(() => {
  const worker = service('worker', {
    source: github('Phong-AHN/Mercantor', { branch: 'main' }),
    healthcheck: '/health',
    // Railway's own unmanaged default is 5 minutes - the 30s originally set
    // here was too tight for a cold image pull plus container boot, and
    // caused a real failed deploy ("Retry window: 30s", 2 attempts, done)
    // even though the app itself came up in about a second once the
    // container actually started.
    healthcheckTimeout: 180,
    // Every variable actually set on the service needs an entry here, even
    // a `preserve()` one - IaC treats this file as the *whole* desired
    // state, so a variable present on Railway but missing from this list is
    // a pending delete the next `apply` would carry out. Confirmed the hard
    // way: an early `plan` here proposed deleting 10 variables the
    // dashboard already had (DIRECT_URL, WORKER_HEALTH_PORT, the legacy
    // Slack/ClickUp/Resend ones) simply because they weren't listed yet.
    env: {
      NODE_ENV: 'production',
      RAILWAY_DOCKERFILE_PATH: 'infra/Dockerfile.worker',
      PORT: '3100',
      APP_ENV: preserve(),
      APP_URL: preserve(),
      DATABASE_URL: preserve(),
      DIRECT_URL: preserve(),
      SESSION_SIGNING_SECRET: preserve(),
      CREDENTIAL_ENCRYPTION_KEY: preserve(),
      REDIS_URL: preserve(),
      LOG_LEVEL: preserve(),
      WORKER_HEALTH_PORT: preserve(),
      S3_BUCKET: preserve(),
      S3_REGION: preserve(),
      S3_ENDPOINT: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      // Legacy/unused since D-052 (self-service per-organization credentials
      // replaced these) - preserved rather than deleted only because
      // they're already set and harmless sitting unread, not because the
      // worker needs them.
      EMAIL_FROM: preserve(),
      SLACK_BOT_TOKEN: preserve(),
      SLACK_SIGNING_SECRET: preserve(),
      CLICKUP_API_TOKEN: preserve(),
      CLICKUP_TEAM_ID: preserve(),
      RESEND_API_KEY: preserve(),
    },
  });

  return project('mercantor', {
    resources: [worker],
  });
});
