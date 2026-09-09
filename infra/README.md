# infra

`Dockerfile.worker` builds the background worker as its own container — it holds a blocking Redis
connection and a request-scoped runtime cannot host it. `.railway/railway.ts` (repo root, not this
directory — Railway's Infrastructure-as-Code CLI looks for it there) is the Railway deploy
definition for that one service; see `RUNBOOK.md` → "Deploying the worker to Railway" for the
`railway config plan`/`apply` workflow. `apps/web` is not defined there — it deploys to Vercel in
this project, not Railway; if that ever changes, it needs no Dockerfile (Railway's own builder
detects Next.js natively), only a `/api/health` healthcheck path
(`apps/web/src/app/api/health/route.ts`) instead of the worker's `/health`.

**Railway's older "Config as Code" (`railway.json`/`railway.toml` in a service's repo) is
deprecated and does not work for a service created after Infrastructure as Code shipped** — this
project used to keep one here, found out the hard way it silently did nothing for a freshly created
service, and removed it. Don't reintroduce a `railway.json`/`railway.toml` file; edit
`.railway/railway.ts` instead.

Local development uses `docker-compose.yml` at the repository root: Postgres 17 on 5433, Redis 7
on 6380, MinIO on 9010 with its console on 9011. The ports are deliberately non-default so the
containers do not fight anything already installed on the machine.
