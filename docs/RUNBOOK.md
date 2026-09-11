# Mercantor — Runbook

---

## Local development

```bash
pnpm install
cp .env.example .env
pnpm infra:up            # Postgres :5433, Redis :6380, MinIO :9010 / console :9011
                          # (a one-shot sidecar also creates the relay-media-dev bucket)
pnpm db:migrate:deploy
pnpm db:seed             # destructive: clears and rebuilds the demo data
pnpm dev                 # http://localhost:3000
pnpm dev:worker          # worker + health on :3100
```

The ports are deliberately non-default (5433, 6380, 9010) so the containers do not fight a
Postgres or Redis you already have installed.

### Verifying a change

```bash
pnpm verify              # format:check + lint + typecheck + test (no infrastructure needed)
pnpm test:integration    # real Postgres, real server actions - needs `pnpm infra:up`
pnpm build               # production build of every workspace
node scripts/e2e-smoke.mjs             # real browser, real sign-in, cross-role boundaries
node scripts/upload-smoke.mjs          # real browser, real MinIO round trip for a file attachment
node scripts/change-request-smoke.mjs  # real browser: price, approve, invoice line created
node scripts/thread-smoke.mjs          # real browser: reply to a reply, the portal pipeline view
node scripts/clickup-task-smoke.mjs    # real browser: create-task button, refused when unlinked
node scripts/auto-approval-smoke.mjs   # real browser: stage move auto-requests the checkpoint
node scripts/portfolio-export-smoke.mjs # real browser: CSV export, its RBAC gate, and filters
node scripts/sla-breach-smoke.mjs      # real browser: a breach opens on save, resolves when fixed
node scripts/analytics-smoke.mjs       # real browser: trend charts render with visible marks
node scripts/integration-link-smoke.mjs # real browser: connect/disconnect Slack and ClickUp from Settings
```

`change-request-smoke.mjs` creates its own throwaway project rather than touching seeded demo
data - approving a change request has no "undo" by design. It prints the cleanup command
(`scripts/delete-project.ts <code>`) at the end; run it.

`sla-breach-smoke.mjs` is the one script that reads and writes seeded data instead: a brand-new
project's own start date is "now", so `Project_target_after_start` correctly refuses to let one be
already overdue, and there is no other way to demonstrate a breach live. It uses the seeded
`PRJ-0003` (overdue by design), captures its target launch date first, and restores it in a
`finally` block regardless of how the run goes.

**On Windows, `pnpm db:generate` can fail with `EPERM ... query_engine-windows.dll.node`** if
`pnpm dev` or `pnpm dev:worker` is still running - the engine binary is locked while a Node
process has it loaded. Stop both first, then regenerate, then restart them.

**`pnpm test:integration`** runs against the database `pnpm infra:up` starts, through a harness
(`apps/web/test/`) that mocks only `next/headers`, `next/cache` and `server-only` — everything
else is the real exported action, the real Prisma client, the real RBAC engine. Each test file
creates its own users, merchant and project with a random suffix and deletes exactly what it
created in an `afterAll`, so it is safe to run against a database that also holds seeded demo
data or another developer's in-progress work. `fileParallelism: false` because every file shares
one connection pool.

**One file breaks that per-fixture pattern on purpose:**
`apps/worker/src/processors/maintenance.integration.test.ts` (D-037) is the harness's first worker
processor rather than a web server action, and `slaSweep()` is deliberately whole-database, not
project-scoped - a test run also nags about every seeded demo project, not only its own fixture.
Its `afterEach` cleans up by the frozen test date instead (`Notification.dedupeKey` containing
`2026-09-10` or `2026-09-11`), which is the only thing that can safely span the whole table:
nothing a real sweep writes today can carry a 2026 date that far out. It is also self-contained
rather than reusing `apps/web/test/fixtures.ts` - `apps/worker`'s `tsconfig.json` scopes `rootDir`
to its own `src`, so it builds its minimal project directly with `db.*.create()`, the same way
`packages/db/src/transaction.integration.test.ts` does.

Sixty-one tests today, chosen for what would hurt most if they silently broke:

| File                                                             | Proves                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/transaction.integration.test.ts`                | A transaction that throws after a real write leaves nothing behind - the guarantee the outbox pattern depends on (D-013).                                                                                                                                                                                                                                                                         |
| `apps/web/src/features/blockers/actions.integration.test.ts`     | Handing a blocker over closes the previous ownership span and opens the next at the exact same instant, with no gap and no overlap.                                                                                                                                                                                                                                                               |
| `apps/web/src/features/approvals/actions.integration.test.ts`    | The handoff readiness gate refuses submission and names what is missing, then opens once every requirement - design, dev, QA, merchant approval, blocking access, required assets - is actually met.                                                                                                                                                                                              |
| `apps/web/src/features/activity/actions.integration.test.ts`     | Comment visibility is enforced by the query, for all three teams, on both the read and the write side; a reply's parent id must be a comment on the same project (D-032).                                                                                                                                                                                                                         |
| `apps/web/src/features/issues/actions.integration.test.ts`       | A launch blocker queues one notification email and one Slack DM per recipient (never the reporter); an ordinary issue queues neither; a ClickUp task is a subtask of the linked task (D-027, D-036, D-039).                                                                                                                                                                                       |
| `apps/web/src/features/attachments/actions.integration.test.ts`  | Against a real MinIO: a bad type/size is rejected before storage is touched; real bytes that disagree with the declared type are deleted and never attached; a key from another project is refused; a file attached to an `INTERNAL_AHN` comment logs its activity at that visibility, never `EVERYONE`, and a comment id from another project is refused (D-043).                                |
| `apps/web/src/features/checklists/actions.integration.test.ts`   | Only `invoice:manage` can approve a change request; an unpriced or already-approved one cannot be approved; approval creates exactly one linked invoice line, atomically (D-031).                                                                                                                                                                                                                 |
| `apps/web/src/features/invoices/actions.integration.test.ts`     | A payment accumulates against the real running total, never overwrites it, and is refused outright once it would exceed the invoice (D-037).                                                                                                                                                                                                                                                      |
| `apps/worker/src/processors/maintenance.integration.test.ts`     | The SLA sweep's per-day dedupe (D-037); a stage or launch breach opens dated to the exact crossing and never duplicates; a launch breach resolves once its date is pushed out, and never earlier than it started even against an earlier "now" (D-041); a pending-approval nag queues an email and a Slack DM the first time and neither again the same day (D-043).                              |
| `apps/web/src/features/projects/actions.integration.test.ts`     | Entering the stage a checkpoint is due in requests it automatically, attributed to nobody; a live or decided request is never clobbered; one sent back for changes is re-requested, its stale rejection note cleared (D-038, D-043); `moveStage` closes a stage breach for the stage being left, and a launch breach the moment the project completes, leaving an unrelated breach alone (D-041). |
| `apps/worker/src/processors/integrations.integration.test.ts`    | A Slack DM outbox row is delivered by resolving the recipient's Slack id from their email at delivery time, never a stored id (D-039).                                                                                                                                                                                                                                                            |
| `apps/web/src/app/api/projects/export/route.integration.test.ts` | The CSV export carries the same `invoice:read` money gate and merchant project-scoping as the portfolio table, and applies the query string the same way `listProjects` does (D-040).                                                                                                                                                                                                             |
| `apps/web/src/features/analytics/queries.integration.test.ts`    | Started/launched projects and SLA breaches bucket into the correct calendar month, cycle time averages correctly per month, and a project outside the trailing window is excluded entirely (D-042).                                                                                                                                                                                               |

**`scripts/e2e-smoke.mjs`** needs the dev server and Chrome instead. It checks that the ten
answers render, that the blocker banner is prominent, that an update reaches the feed, and — the
ones that matter — that SHOPLINE cannot see AHN-internal notes, that a merchant cannot open
somebody else's project, and that a merchant sees neither internal nor AHN/SHOPLINE-only notes.

### Writing a schema migration

`prisma migrate dev` refuses to run in a non-interactive shell (an agent, CI, or any script that
is not an actual terminal). To write one anyway: edit `schema.prisma`, then

```bash
pnpm exec prisma migrate diff \
  --from-url "$DATABASE_URL" --to-schema-datamodel packages/db/prisma/schema.prisma --script
```

paste the output into a new `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`
(timestamp format matches the existing folders), then `pnpm db:migrate:deploy`. Regenerate the
client afterwards with `pnpm db:generate` - see the Windows file-lock note above.

---

## Environment

Required in production. `.env.example` documents every one.

| Variable                                                         | Notes                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                   | Use a pooled endpoint. `DIRECT_URL` for migrations. **On Supabase, append `?pgbouncer=true`** - see below.                                                                                               |
| `REDIS_URL`                                                      | Shared by the app (producer) and the worker (consumer).                                                                                                                                                  |
| `SESSION_SIGNING_SECRET`                                         | 32 random bytes, base64. `openssl rand -base64 32`                                                                                                                                                       |
| `CREDENTIAL_ENCRYPTION_KEY`                                      | Same. Rotating it invalidates stored credentials.                                                                                                                                                        |
| `APP_URL`                                                        | Used in every outbound link. Getting it wrong is the most common cause of "the Slack link is broken".                                                                                                    |
| `S3_*`                                                           | MinIO locally, S3 in production. `S3_BUCKET` must already exist — nothing creates it at boot.                                                                                                            |
| `SLACK_BOT_TOKEN` etc.                                           | Legacy/unused (see below) — still declared, optional, read by nothing.                                                                                                                                   |
| `SLACK_OAUTH_CLIENT_ID/SECRET`, `CLICKUP_OAUTH_CLIENT_ID/SECRET` | One-time, platform-level (D-053) — powers the "Connect via Slack/ClickUp" button at `/integrations`. Absent means that button stays hidden; manual token paste still works either way. See `TODO.md` §3. |

`env()` validates everything at first access and lists **all** problems at once, so a missing
secret fails the boot rather than the first request that happens to need it.

**On Supabase specifically, three separate connection issues showed up back to back going live -
worth knowing all three rather than fixing one and assuming the database is done:**

1. **The direct connection host (`db.<ref>.supabase.co:5432`, what `DIRECT_URL` normally is)
   resolves IPv6-only.** Platforms without reliable outbound IPv6 (Railway confirmed; this
   project's own `docker build`/local shell hit the identical `P1001: Can't reach database server`)
   cannot reach it at all, `env()` validation aside - the URL is well-formed, the server is up, the
   network path simply isn't there. Fix: use Supabase's **Session Pooler** connection string
   instead (same pooler host as below, port `5432`) for `DIRECT_URL` - it's IPv4-reachable and
   supports the prepared statements `prisma migrate deploy` needs, which the Transaction Pooler
   below does not.
2. **The Transaction Pooler (`aws-0-<region>.pooler.supabase.com:6543`, what `DATABASE_URL` should
   be) needs `?pgbouncer=true` appended, or Prisma throws `42P05: prepared statement "s0" already
exists`** the moment two queries in a row reuse a pooled connection PgBouncer has multiplexed
   with a different client's session - not on the first query (which is why a quick manual check
   can look fine), reliably on the second. Confirmed live: an invite/reset flow's
   `consumePasswordToken` immediately followed by `db.user.update` crashed with exactly this on
   both Railway and Vercel until `?pgbouncer=true` was added to `DATABASE_URL` on each. The flag
   tells Prisma's query engine to skip its own prepared-statement caching, which is what collides
   with PgBouncer's transaction-mode multiplexing in the first place.
3. **Both processes need the fix independently** - `apps/worker` (Railway) and `apps/web` (Vercel)
   each hold their own copy of `DATABASE_URL`/`DIRECT_URL`, set separately on each platform, and
   fixing one does nothing for the other.

**Since D-052, every organization first tries its own self-configured credentials at
`/integrations`** (encrypted at rest, `packages/integrations/src/registry.ts`'s
`integrationsFor(organizationId)`), resolved fresh from the database per organization rather than
from the process environment - self-service is the intended long-term shape, and a stored token can
change at any moment, so nothing here is cached. **`SLACK_BOT_TOKEN` / `CLICKUP_API_TOKEN` /
`RESEND_API_KEY` in `.env` are the fallback, not dead** (reverted back from "do nothing" - in
practice most organizations here are still using AHN's own shared account, not one of their own,
and requiring every one of them to separately connect a working token before Slack/ClickUp/email
did anything real broke exactly that, live). The order per provider: an organization's own active,
decryptable row wins; missing or undecryptable (wrong/rotated `CREDENTIAL_ENCRYPTION_KEY`,
corruption) falls to the matching env var; both absent falls to the mock, same meaning an absent
env var always carried. Verified directly against production (read-only): a fake organization id
with no `OrganizationIntegration` rows at all resolved to `live`/`reachable` for all three
providers using only the env credentials, and resolved to `mock` for all three once those env vars
were unset.

**`apps/web/test/integration-setup.ts` deletes these three env vars at the top, on purpose.** A
developer's real `.env` has real values for them (that is the whole point of the fallback above) -
without deleting them before any test runs, no test fixture organization has a configured
`OrganizationIntegration` row (nothing creates one unless a test deliberately does), so every one
of them would now fall through to those real, working credentials and integration tests would post
real Slack messages, create real ClickUp tasks and send real email on every run, not hit the mock.
`env()` caches its result after first call, so this only works because it runs before anything in
the test file's own import graph has called `env()` yet - the same setup-file-runs-first ordering
this file already relies on for its `next/headers`/`next/cache` mocks.

**A Redis instance at its `maxmemory` cap rejects the Lua scripts BullMQ needs to schedule
jobs** (`OOM command not allowed when used memory > 'maxmemory'`), which reads in the worker log
as a boot failure with no obvious cause. If `REDIS_URL` points at a shared/cloud instance and the
worker won't come up, check memory usage on that instance before anything else. **The Redis Cloud
instance this project's `.env` was configured against went further and started rejecting its own
password (`WRONGPASS`)** (checked 2026-09-07) - `REDIS_URL` is currently pointed at the local
`pnpm infra:up` Redis instead (the cloud line is commented out, not deleted, in `.env`). Swap it
back once you have a working credential for that instance, or provision a fresh one.

**A shell `export REDIS_URL=... ; nohup pnpm dev & nohup pnpm dev:worker &` in the same invocation
does not reliably reach both processes on this project's Windows/Git Bash setup** - one was
observed still connecting to the value in `.env` despite the override (confirmed via `netstat`
showing a connection to the cloud host, not `localhost`). Editing `REDIS_URL` directly in `.env`
before starting either process is the reliable way to point dev at a different Redis; don't trust
a shell export alone without checking `netstat` after.

**A custom BullMQ job id cannot contain `:` unless it splits into exactly 3 parts** - BullMQ
reserves that shape for its own `repeat:<hash>:<timestamp>` ids. `retryOutbox`'s job id was
`outbox:<uuid>` (2 parts) until D-046, which `Job.validateOptions` rejected synchronously, before
ever reaching Redis; `enqueue()` catches that and logs it, so the failure never surfaces as
anything louder than a log line - every retry sweep failed silently, forever, and only a message
delivered on its first, immediate attempt ever went out. If outbox messages are stuck `PENDING`
with `attempts: 0` a while after being written, check the worker log for `Custom Id cannot contain
:` before assuming the provider is the problem.

**Linking a project to Slack (project Settings page) needs OAuth scopes beyond what posting a
message needs**: `conversations.list` (used to populate the channel picker) requires
`channels:read`, `groups:read`, `mpim:read` and `im:read` on the bot token, and resolving a
personal Slack DM (`notification_dm`, for urgent notifications) separately needs
`users:read.email`. A token scoped only for sending (`chat:write`, `channels:history`, etc.) will
get `missing_scope` back for either - the form and the outbox both show this clearly rather than
hanging, but stay unusable for that specific call until the scope is added in the Slack app's
OAuth & Permissions page and the app is reinstalled to the workspace.

**A Resend account with no verified sending domain fails every send permanently**, not just the
ones from an unverified address - check `GET https://api.resend.com/domains` (or the Resend
dashboard) for at least one verified domain matching `EMAIL_FROM` before assuming a code issue if
`EMAIL` outbox messages stay stuck retrying. This affects invite and password-reset emails
(D-051) exactly the same way it affects everything else email sends - the account itself was
created fine either way, so check `/people` (or the project's Settings page) rather than assuming
the invite failed outright.

`loadRootEnv()` deliberately does nothing in production: the platform supplies real environment
variables there, and reading a committed file would be a way to ship the wrong ones.

**Sign-in rate limiting (D-051) is IP-keyed, not account-keyed, and has no env-var knobs yet.**
The free-attempt count, the delay curve, its cap, and the quiet-window reset are constants at the
top of `packages/auth/src/rate-limit.ts` - edit and redeploy to change them, there is nothing to
set in `.env`. A user reporting "it won't let me sign in, says to wait" after real mistyped
attempts is the feature working as intended, not a bug; a shared office/VPN IP hitting the same
limit for multiple different people is the one real cost of keying by IP instead of by account
(see `SignInThrottle`'s and D-051's own comments for why the account-keyed alternative is worse).

---

## Deploying

Two processes, and they cannot be one:

**`apps/web`** — any Node host or serverless platform. `pnpm --filter @relay/web build`, then
`start`. It only ever produces queue jobs.

**A platform that scopes its build command to `apps/web` alone (Vercel's "Root Directory" set to
`apps/web`, for one) never runs `packages/db`'s own `build` script** (`prisma generate`) - only the
root `pnpm build` (`pnpm -r build`) does that automatically. Without it, `@relay/db`'s generated
Prisma Client is missing or stale, and `next build` fails - either a webpack
`Module not found: Can't resolve '.prisma/client/default'`, or a TypeScript error several layers
downstream that looks unrelated (`Parameter 'x' implicitly has an 'any' type` on a `.map`/`.filter`
over a query result, since the untyped client makes the whole inferred chain `any`). Reproduced
locally by deleting the generated client and running `pnpm --filter @relay/web build` alone.
**Fixed once, for every platform, by `packages/db/package.json`'s `postinstall: "prisma generate"`** -
pnpm runs every workspace package's own `postinstall` after `pnpm install`, regardless of which
subdirectory a platform's build command is scoped to, so the client exists before any build step
gets a chance to run. Verified the same way: delete the generated client, `pnpm install`, confirm
the `postinstall` line generates it, then `pnpm --filter @relay/web build` alone succeeds.

**`apps/worker`** — a long-lived container. It holds a blocking Redis connection and cannot run
on a request-scoped runtime. `RELAY_ROLE=worker` is set by its own entry shim; without it, the
queue consumer refuses to start. Point the platform's health check at `:3100/health`.

Run `pnpm db:migrate:deploy` before releasing either.

### Deploying the worker to Railway

Railway is a good fit specifically because it runs a plain long-lived container rather than only
request-scoped functions - `apps/worker` cannot go on a serverless platform (Vercel included) for
exactly that reason. In this project's actual split, `apps/web` stays on Vercel; only the worker
goes to Railway. Either way both processes need to point at the **same** `DATABASE_URL` and
`REDIS_URL`.

**Railway's older "Config as Code" (a `railway.json`/`railway.toml` a service reads from its own
repo) is deprecated, and does not work at all for a service created after Infrastructure as Code
shipped** - "New services cannot opt into Config as Code" is Railway's own wording. This project
briefly kept one (`infra/railway.worker.json`) before finding that out the hard way: the service
deployed and the healthcheck failed exactly as if the file did not exist, because for a new
service it does not. Removed. The deploy definition lives in `.railway/railway.ts` at the repo
root instead, managed by the Railway CLI's `railway config plan`/`apply` - not the dashboard's
per-service settings.

1. **Install the Railway CLI** and `railway login`, then `railway link` from the repo root to pick
   (or create) the Railway project and environment this should manage.
2. **`.railway/railway.ts` is already written** - one `service("worker", ...)`, no `build`/`start`
   fields (those pick Railway's Railpack/Nixpacks builder; the worker needs its own
   `infra/Dockerfile.worker`, selected via the `RAILWAY_DOCKERFILE_PATH` environment variable
   instead, since the Dockerfile lives outside the default root), no `rootDirectory` (the
   Dockerfile's `COPY` commands are relative to the repo root, not `apps/worker` - scoping the
   source there breaks every one of them), no `domains` (the worker takes no inbound traffic but
   Railway's own healthcheck, reached over the private network on the port
   `infra/Dockerfile.worker`'s `EXPOSE 3100` already declares). The file's own comments explain
   each choice; read them before changing anything.
3. **Set the real secret values before the first apply, outside the file** - either the Railway
   dashboard's Variables tab for the (not-yet-existing) worker service, or
   `railway variables set KEY=value` per variable. The file declares each one as `preserve()`
   (`DATABASE_URL`, `SESSION_SIGNING_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `REDIS_URL`, `APP_URL`,
   `S3_*`) specifically so a real secret is never written into a file this repo commits to GitHub -
   `preserve()` means "whatever is already set on Railway, don't touch it from here", which has
   nothing to preserve the very first time. **`DATABASE_URL`, `SESSION_SIGNING_SECRET`,
   `CREDENTIAL_ENCRYPTION_KEY` are not optional** - `apps/worker/src/main.ts`'s very first line is
   `const config = env()`, before the health server, before anything else, and `env()` throws
   synchronously if any of the three is missing (`packages/config/src/env.ts`'s schema - no
   `.default()`, no `.optional()` on those three). A missing one crashes the process before it
   ever binds the health port, which Railway reports as a healthcheck that never once succeeds
   across its whole retry window - not a slow boot, a crash loop. Set `REDIS_URL` explicitly too -
   its schema default (`redis://localhost:6380`) is meant for local dev only and does not exist
   inside a Railway container, so leaving it unset makes `installSchedules()` hang waiting for a
   Redis that will never answer, which looks identical to the crash-loop case from the
   healthcheck's side (the health port never opens either way).
4. **`railway config plan`** - read-only, safe to run any time, prints exactly what would be
   created/changed. Confirm it shows one service being created and nothing unexpected before
   going further.
5. **`railway config apply`** - review the same plan again and confirm. Watch the build logs for
   `pnpm --filter @relay/db generate` succeeding and the first runtime log line naming every
   installed schedule (`packages/queue/src/queues.ts`); then confirm the service goes healthy.
   **If the healthcheck fails on every attempt with no partial progress, that is a boot-time crash
   or hang, not a slow start** - open the service's Deploy Logs (not the build log) for the actual
   error; it is almost always one of the two env var causes above.

Scaling past one instance is safe if it's ever needed - every scheduled task and every outbox
delivery is written to be idempotent (`RUNBOOK.md`'s "The scheduled work" table), so two workers
racing the same job is a no-op, not a double send - `replicas` in `.railway/railway.ts` is the
field for it, but there is no throughput reason to raise it from the current `1` yet.

**Two more failure modes actually hit and fixed while first standing this service up, both
already reflected in `.railway/railway.ts` and worth knowing if the healthcheck ever fails again
after a real change:**

- **`healthcheckTimeout` too short.** Railway's own unmanaged default is 5 minutes; an earlier
  `30` here failed a real deploy outright ("Retry window: 30s", 2 attempts, done) even though the
  app itself came up in about a second once the container actually started - a cold image pull
  eats into that window before the app gets a chance to run at all. Now `180`.
- **A custom port needs an explicit `PORT` variable, `EXPOSE` in the Dockerfile notwithstanding.**
  Confirmed live: the worker was genuinely healthy (`worker health endpoint listening` in the
  logs, then it went on to process and log a job failure without crashing) while Railway's own
  healthcheck prober reported "service unavailable" on every attempt across the whole retry
  window. Nothing in this app reads `process.env.PORT` - it reads `WORKER_HEALTH_PORT` instead -
  but Railway's healthcheck prober still needs a `PORT` variable to know which container port to
  probe when a service doesn't bind to whatever `$PORT` it was handed. Setting `PORT: '3100'` in
  `.railway/railway.ts`'s `env` (matching `WORKER_HEALTH_PORT`) fixed it immediately - no code
  change, no rebuild, just that one variable.

**A third thing worth knowing before touching `env` in `.railway/railway.ts` again**: every
variable actually present on the service needs an entry there, even a `preserve()` one - IaC
treats the file as the _whole_ desired state of everything it lists, so a variable Railway already
has but this file doesn't mention is a pending delete on the next `apply`. Confirmed the hard way:
an early `plan` here proposed deleting 10 variables the dashboard already had (`DIRECT_URL`,
`WORKER_HEALTH_PORT`, and the legacy Slack/ClickUp/Resend ones among them) simply because they
were not yet listed. Always read what `railway config plan` actually proposes - especially the
destructive-change count - before ever running `apply`.

If `apps/web` ever moves to Railway too, add a second `service(...)` to the same
`.railway/railway.ts` (one file per environment, not one per service) - no Dockerfile needed
(Railway's own builder detects Next.js natively), and set its healthcheck to `/api/health`
(`apps/web/src/app/api/health/route.ts`), not `/health` - that path only exists on the worker, a
different service on a different port.

---

## The scheduled work

Installed by the worker at boot, in `packages/queue/src/queues.ts`.

| Task                     | When         | What it does                                                                                                                         |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `retry-outbox`           | every 2 min  | Re-enqueues pending outbox rows                                                                                                      |
| `recompute-health`       | every 15 min | Refreshes derived health and the current blocker on every open project                                                               |
| `invoice-sweep`          | 06:10 daily  | Marks invoices overdue and notifies once per invoice per person                                                                      |
| `sla-sweep`              | 07:00 daily  | Unanswered introductions, missing access and assets, inactivity, pending approvals, stage overruns — deduplicated per person per day |
| `purge-expired-sessions` | 03:30 daily  | Housekeeping                                                                                                                         |

All of them are idempotent. Running one twice in the same minute produces neither a second nag nor
a second delivery.

---

## Diagnosing

**"Slack is not getting updates."** Open `/integrations`. If the provider says _mock_, no token is
set — that is working as designed. If rows are `PENDING`, the worker is down or Redis is
unreachable; the sweep will catch up on its own once it is back. If rows are `FAILED`, read
`lastError`: a revoked token and a channel the bot was never invited to are the two common ones,
and both are non-retryable on purpose.

**"A project shows the wrong health."** Health is derived. Open the project's **Time & SLA** tab —
the reasons are listed there. If the list and the project disagree, the denormalised column is
stale; the fifteen-minute sweep fixes it, or any mutation on the project will.

**"The time attribution looks wrong."** The **Blocker timers** table on the Time & SLA tab shows
every ownership span with its start, end and duration. The rule: an open blocker charges its
owner whatever stage the project is in; overlapping blockers do not double count, and the one that
opened first keeps the overlap.

**"Somebody can see something they should not."** That would be a bug in a query, not in a page —
every read starts from `projectScopeWhere(principal)` and, for the feed,
`readableVisibilities(principal)`. Run `node scripts/e2e-smoke.mjs`; it exercises exactly those
boundaries.

**"The build fails globbing the user's home directory."** Prisma's client must generate into
`node_modules`. A custom `output` outside it makes Next's file tracer walk up looking for
`schema.prisma` and glob the home folder. Do not reintroduce `output` in the generator block.

**"Vercel build succeeds, every DB-touching page 500s in production"** ("Prisma Client could not
locate the Query Engine for runtime `rhel-openssl-3.0.x`" in the function logs,
`FUNCTION_INVOCATION_FAILED`). The build passing proves nothing here - `next build` only needs the
Prisma Client's TypeScript types, not its native query-engine binary, so a missing engine for the
target platform only surfaces at request time. Root cause: `schema.prisma`'s `generator client`
block had no `binaryTargets`, so the client only ships the engine for whatever platform actually
ran `prisma generate` - Windows locally, `linux-musl` in the worker's Alpine Docker image, neither
of which matches Vercel's serverless runtime (`rhel-openssl-3.0.x`). A redeploy alone does not fix
this - it's not a stale-build/cache problem, the wrong engine is genuinely what gets built every
time until `binaryTargets` says otherwise. Fixed by setting
`binaryTargets = ["native", "rhel-openssl-3.0.x"]` so both engines ship regardless of where
`generate` runs. Verify locally before trusting a redeploy: after `prisma generate`,
`packages/db/node_modules/.prisma/client/` (or the workspace root's, depending on hoisting) should
contain both `query_engine-windows.dll.node` (or your local platform's) and
`libquery_engine-rhel-openssl-3.0.x.so.node`.

**`binaryTargets` was necessary but not sufficient - the identical error came back on a later
deploy with no schema change at all.** The engine existed in `node_modules` (confirmed locally,
and the earlier fix was verified live against production once), yet a subsequent build 500'd again
with the same "could not locate the Query Engine for runtime rhel-openssl-3.0.x". Cause: Next's
**output file tracing** - the static analysis that decides which files actually get copied into
each route's deployed serverless function - resolves Prisma's engine through a dynamic `require`
it cannot follow through pnpm's hashed `.pnpm/@prisma+client@<version>_<hash>/` store path, so
whether the binary makes it into a given function bundle is not reliable even when it exists on
disk at build time. This is Prisma's own documented failure mode for Next.js
(https://pris.ly/d/engine-not-found-nextjs). Fixed in `apps/web/next.config.ts` with
`outputFileTracingIncludes` forcing every route to include
`../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*` (glob on the hash
since it changes with the lockfile) alongside the unhashed `../../node_modules/.prisma/client/**/*`
in case of different hoisting. **Verify by inspecting the trace, not just the build succeeding**:
after `pnpm --filter @relay/web build`, `apps/web/.next/server/app/**/*.nft.json` for any
DB-touching route should list a path containing `libquery_engine-rhel-openssl-3.0.x.so.node` -
`grep -o '"[^"]*libquery_engine[^"]*"' apps/web/.next/server/app/(auth)/sign-in/page.js.nft.json`.
An empty result there is the actual bug reproduced locally, before ever pushing.

**"Every page feels slow, even a dashboard that runs one query."** Measured live against
production (2026-09-09): sign-in to dashboard ~18s, `/dashboard` ~8.7s for a page whose only query
is one `project.findMany`, `/projects/[code]` ~18s. Not a query-count problem - the cause is that
the Vercel deployment had no `regions` set, which defaults the serverless function to `iad1`
(US East, confirmed from an actual function-invocation log), while Supabase is
`aws-0-ap-southeast-1` (Singapore) and real users are in Asia. Every DB round trip - and the
session lookup alone (`getPrincipal` → `resolveSession`) runs on every single page - crossed the
Pacific twice. `apps/web/vercel.json`'s `"regions": ["sin1"]` was added first and is harmless to keep (Root
Directory is `apps/web`, so that is where `vercel.json` has to live for Vercel to read it at all),
but **it alone did not move the deployed function** - confirmed live: after that file was pushed
and a fresh deploy went out clean, `curl -sD- -o /dev/null https://www.mercantor.co/api/health`
still showed `x-vercel-id: hkg1::iad1::...` (edge in Hong Kong, function still executing in
Washington DC). **The actual switch is Project Settings → Functions → Function Region in the
Vercel dashboard** - a manual, per-project setting that is not driven by `vercel.json` on this
project/plan. Changed by hand to Singapore; the very next request showed
`x-vercel-id: hkg1::sin1::...`, and the numbers backed it up immediately (all measured live against
production, no redeploy needed after the dashboard change): sign-in-to-dashboard 18.0s → 1.9s,
`/dashboard` 8.8s → 0.47s, `/projects/[code]` 17.9s → 0.57s. **If the app is ever pointed at a
database in a different region, this dashboard setting needs to move with it** - it is a single
fixed region for every function, there is no per-database-provider auto-detection, and `vercel.json`
alone will not be enough to change it - check the dashboard first.

---

## ClickUp two-way status sync

The ClickUp push (`features/projects/mutations.ts`'s `fanOut`) was one-way by design (D-052-era
comment: "the portal pushes stage changes at it and never reads status back as the truth") -
moving a task's status manually on ClickUp never updated the project here. Changed because in
practice PMs do move tasks by hand, and the project silently kept showing a stale stage.

**Why the old `DEFAULT_CLICKUP_STATUS_MAP` (`packages/integrations/src/clickup.ts`) could not just
be read backwards**: it maps many stages onto the same ClickUp status name on purpose (e.g.
`INTRODUCTION` and `MERCHANT_CONTACTED` both push `"to do"`) - fine for a one-way push, useless for
the reverse, since seeing `"to do"` come back could mean either stage. Only 3 of its 12 distinct
status strings map to exactly one stage.

**Fixed with an opt-in, always-unambiguous second mapping** rather than trying to disambiguate the
old one: a project picks a genuine *subset* of stages to track
(`Project.clickUpTrackedStages`, chosen at creation in `/projects/new`'s "ClickUp status sync"
section). Each tracked stage's own label - e.g. "Introduction", "Merchant Design Review" - already
unique across all 18 stages - becomes the exact ClickUp status name expected on the linked list
(`clickUpStatusForTrackedStage` / `stageForClickUpStatus` in `clickup.ts`, unit-tested in
`clickup-status-sync.test.ts`). A stage outside the tracked set is invisible to both directions -
`fanOut` skips pushing it, and an incoming webhook for an untracked status name is reported back as
"not tracked," never guessed at. A project with an empty tracked set keeps the old one-way,
best-effort default-map push exactly as before - this is additive, not a breaking change for any
project that has not opted in.

**The webhook, `/api/webhooks/clickup`**: registered per organization by
`setOrganizationIntegration` (`packages/integrations/src/registry.ts`) whenever a ClickUp team id
is saved - best effort, never blocks saving the token itself if ClickUp rejects the registration
(no team id configured, most commonly). The returned `webhookId` is stored in
`OrganizationIntegration.externalWebhookId` **in plaintext, deliberately** - not a secret, just how
the receiver finds which organization a delivery belongs to without decrypting every ClickUp row on
every request, since ClickUp's payload carries its own `webhook_id`, not an organization id. The
actual signing `secret` ClickUp issues alongside it stays inside the encrypted config like
everything else, and every delivery's `X-Signature` header is verified against it
(`timingSafeEqual`) before anything in the payload is trusted.

**Applying an incoming change deliberately does not call `fanOut`'s ClickUp branch**
(`applyClickUpStatusSync` in `features/projects/mutations.ts`) - pushing the same status straight
back at the task that just reported it would be a redundant round trip at best, a feedback loop at
worst. Slack still hears about it; ClickUp does not hear its own news back. Attributed to the
project's own AHN project manager (`StageEvent.changedById` is not nullable, and a real person's
audit trail beats inventing a system user) - **a project with no PM assigned cannot be synced this
way**, reported back as a `lastError` on the `IntegrationLink`, never silently dropped.
`checkTransition` (the same state-machine rules a manual move in this app already obeys) still
applies - an illegal move on the ClickUp side is not applied here either, and is reported back the
same way as an unmatched status.

**Reconnecting or disconnecting ClickUp always tears down the previous webhook first**
(`teardownClickUpWebhook`) - best effort (ClickUp unreachable never blocks saving/clearing the
org's own config), but without it a rotated token would leave an orphaned webhook on ClickUp's side
still trying to deliver with a secret nothing has anymore.

---

## Backups & data

The project record is the product. Back up Postgres; everything else — Redis, the object store —
is recoverable or replaceable.

`AuditLog` and `ActivityEvent` are append-only in practice. Nothing in the application updates or
deletes them, and nothing should: they are what makes "who changed this and when" answerable.
