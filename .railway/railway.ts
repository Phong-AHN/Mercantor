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
    healthcheckTimeout: 30,
    env: {
      NODE_ENV: 'production',
      RAILWAY_DOCKERFILE_PATH: 'infra/Dockerfile.worker',
      DATABASE_URL: preserve(),
      SESSION_SIGNING_SECRET: preserve(),
      CREDENTIAL_ENCRYPTION_KEY: preserve(),
      REDIS_URL: preserve(),
      APP_URL: preserve(),
      S3_BUCKET: preserve(),
      S3_REGION: preserve(),
      S3_ENDPOINT: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
    },
  });

  return project('mercantor', {
    resources: [worker],
  });
});
