# infra

`Dockerfile.worker` builds the background worker as its own container — it holds a blocking Redis
connection and a request-scoped runtime cannot host it.

The web app deploys as an ordinary Next.js application; it has no infrastructure of its own beyond
the environment variables listed in `.env.example`.

Local development uses `docker-compose.yml` at the repository root: Postgres 17 on 5433, Redis 7
on 6380, MinIO on 9010 with its console on 9011. The ports are deliberately non-default so the
containers do not fight anything already installed on the machine.
