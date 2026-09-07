# Relay — Runbook

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

| Variable                    | Notes                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Use a pooled endpoint. `DIRECT_URL` for migrations.                                                   |
| `REDIS_URL`                 | Shared by the app (producer) and the worker (consumer).                                               |
| `SESSION_SIGNING_SECRET`    | 32 random bytes, base64. `openssl rand -base64 32`                                                    |
| `CREDENTIAL_ENCRYPTION_KEY` | Same. Rotating it invalidates stored credentials.                                                     |
| `APP_URL`                   | Used in every outbound link. Getting it wrong is the most common cause of "the Slack link is broken". |
| `S3_*`                      | MinIO locally, S3 in production. `S3_BUCKET` must already exist — nothing creates it at boot.         |
| `SLACK_BOT_TOKEN` etc.      | Optional. Absent means the mock adapter answers.                                                      |

`env()` validates everything at first access and lists **all** problems at once, so a missing
secret fails the boot rather than the first request that happens to need it.

**Setting real `SLACK_BOT_TOKEN` / `CLICKUP_API_TOKEN` / `RESEND_API_KEY` switches
`pnpm test:integration` from mocks to the real APIs**, which then correctly reject the suite's
fixture IDs. Blank them for that run (mocks), or give the suite fixtures matching a real
workspace — don't just re-run and assume a fresh failure is a regression.

**A Redis instance at its `maxmemory` cap rejects the Lua scripts BullMQ needs to schedule
jobs** (`OOM command not allowed when used memory > 'maxmemory'`), which reads in the worker log
as a boot failure with no obvious cause. If `REDIS_URL` points at a shared/cloud instance and the
worker won't come up, check memory usage on that instance before anything else.

`loadRootEnv()` deliberately does nothing in production: the platform supplies real environment
variables there, and reading a committed file would be a way to ship the wrong ones.

---

## Deploying

Two processes, and they cannot be one:

**`apps/web`** — any Node host or serverless platform. `pnpm --filter @relay/web build`, then
`start`. It only ever produces queue jobs.

**`apps/worker`** — a long-lived container. It holds a blocking Redis connection and cannot run
on a request-scoped runtime. `RELAY_ROLE=worker` is set by its own entry shim; without it, the
queue consumer refuses to start. Point the platform's health check at `:3100/health`.

Run `pnpm db:migrate:deploy` before releasing either.

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

---

## Backups & data

The project record is the product. Back up Postgres; everything else — Redis, the object store —
is recoverable or replaceable.

`AuditLog` and `ActivityEvent` are append-only in practice. Nothing in the application updates or
deletes them, and nothing should: they are what makes "who changed this and when" answerable.
