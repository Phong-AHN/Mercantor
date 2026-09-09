# infra

`Dockerfile.worker` builds the background worker as its own container — it holds a blocking Redis
connection and a request-scoped runtime cannot host it. `railway.worker.json` is Railway
config-as-code for that service (Dockerfile builder, `/health` healthcheck, restart policy) — point
a Railway service's Config-as-code path at it.

The web app deploys as an ordinary Next.js application (no Dockerfile needed — Railway's Nixpacks
builder, Vercel, and most other Node hosts all detect it natively); it has no infrastructure of its
own beyond the environment variables listed in `.env.example`. `railway.web.json` only sets the
healthcheck path to `/api/health` (`apps/web/src/app/api/health/route.ts`) — plain `/health`, which
the worker uses, does not exist on this app and a Railway service healthchecking that path will
report the deploy as unhealthy and kill it even though the app started fine.

Local development uses `docker-compose.yml` at the repository root: Postgres 17 on 5433, Redis 7
on 6380, MinIO on 9010 with its console on 9011. The ports are deliberately non-default so the
containers do not fight anything already installed on the machine.
