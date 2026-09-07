# Mercantor — Architecture

> Written alongside the build. Where a decision differs from AHN Orbit, the reason is stated
> rather than assumed. The predecessor's documentation is preserved in `docs/_legacy-ahn-orbit/`.

---

## 1. Topology

The same constraint that shaped Orbit shapes this: **a serverless function cannot host a BullMQ
worker.** A worker is a long-lived process holding a blocking Redis connection; a request handler
is not. So the split is explicit.

```
                        ┌────────────────────────────────┐
        Browser ───────▶│  apps/web — Next.js App Router  │
                        │  • RSC pages, server actions    │
                        │  • session verification         │
                        │  • enqueue only (never consume) │
                        └───┬─────────────┬───────────────┘
                            │             │
             ┌──────────────┘             └──────────────┐
             ▼                                           ▼
   ┌──────────────────┐                        ┌──────────────────┐
   │ PostgreSQL 17    │◀───────────────────────│ Redis 7          │
   │ • the record     │                        │ • BullMQ queues  │
   │ • the outbox     │                        └────────▲─────────┘
   └──────▲───────────┘                                 │
          │                                             │
   ┌──────┴─────────────────────────────────────────────┴───┐        ┌──────────────────┐
   │ apps/worker — Node                                     │───────▶│ Slack Web API    │
   │  • integrations (outbox delivery - Slack/ClickUp/email)│───────▶│ ClickUp v2       │
   │  • maintenance (health, SLA sweep, invoices, sessions) │───────▶│ Resend           │
   └────────────────────────────────────────────────────────┘        └──────────────────┘
```

**Rule enforced in code review and by ESLint:** `apps/web` _produces_ jobs; it never _consumes_
them. `@relay/queue` splits into a producer half and a consumer half, and
`assertWorkerProcess()` throws unless `RELAY_ROLE=worker`.

One path leaves this diagram: a file attachment's bytes never pass through `apps/web` at all.

- **Upload:** `Browser → apps/web` (ask for a signature) → `apps/web → Browser` (a presigned POST)
  → `Browser → MinIO/S3` (the bytes themselves, direct) → `Browser → apps/web` (confirm) →
  `apps/web → MinIO/S3` (read a few kilobytes back and verify — never the client's claim).
- **Download:** `Browser → apps/web` (`GET /api/attachments/[id]`, RBAC-checked) →
  `apps/web → Browser` (302 to a fresh, short-lived presigned GET) → `Browser → MinIO/S3` directly.

`apps/web` only ever signs and verifies; it is never in the byte path itself, and a download is
always a redirect to a new presigned URL, never a proxied stream. See §5.5.

---

## 2. Request lifecycle

Every authenticated server entry point runs the same four steps, in this order, with no
exceptions. They are implemented once in `apps/web/src/server/action.ts` (`defineAction`) and
`apps/web/src/server/session.ts`.

```
1. authenticate   → resolve the session cookie against Postgres → Principal
2. authorize      → rbac.assertCan(principal, 'blocker:manage') → throws 403
3. validate       → zod parse of the input → typed payload
4. run            → the handler, which never sees raw input and never builds its own principal
```

Two things make this structural rather than conventional:

- **The role is read from Postgres on every request**, never from the cookie. A revoked or
  downgraded account loses access immediately, not at the next sign-in.
- **A handler cannot skip a step**, because it receives `(input, ctx)` and both are produced by
  the wrapper. There is no other way in.

Reads go through `apps/web/src/features/*/queries.ts`, which always start from
`projectScopeWhere(principal)` — the restriction is part of the query, not a filter applied after
the rows have already been fetched.

---

## 3. The domain package

`@relay/core` is browser-safe on purpose: no Node builtins in the barrel, so `'use client'`
components, the server and the worker all share one definition of a stage, a tone, a duration
format and the SLA maths. Node-only helpers (hashing, random tokens) live behind
`@relay/core/server`.

This is a deliberate departure from Orbit, where importing `@orbit/core` from a client component
typechecked and then failed `next build` because the barrel pulled in `node:crypto`. Splitting
the barrel removes the trap instead of documenting it.

### 3.1 The time model — `packages/core/src/sla.ts`

The single computation behind every number the portal shows. It takes stage visits and blocker
ownership spans, and returns project age, per-stage dwell, and where the time went.

The attribution rule, and the reason the maths is worth a module of its own:

> While a blocker is open, **its owner** is charged, whatever stage the project is sitting in.
> Time with no open blocker is charged to the **stage's owning team**. No millisecond is ever
> charged twice, and two blockers open at once do not both charge the same second — the one
> that opened first keeps it.

That is implemented as interval subtraction (`packages/core/src/intervals.ts`), and it is the
part with the most tests, because it is the number people will argue about.

### 3.2 Health is derived, never stored as truth

`assessHealth` computes On Track / At Risk / Blocked from open blockers, launch-blocking issues,
target dates, stage overruns, inactivity and overdue invoices. The `Project.health` column is a
denormalised cache for sorting and filtering the portfolio list; it is recomputed inside the same
transaction as whatever changed it, and again every fifteen minutes by the worker so a project
that quietly aged past its target overnight goes amber on its own.

### 3.3 The stage machine — `packages/core/src/stages.ts`

Eighteen stages, each carrying the two facts the product keeps asking of them: who we are waiting
on, and how long it is supposed to take. Transitions are permissive forwards and backwards —
real migrations loop back to design constantly — but strict about the three that mean something
contractual:

- `COMPLETED` is only reachable from `DEPLOYED_LIVE`
- `DEPLOYED_LIVE` is only reachable from `READY_FOR_DEPLOYMENT`
- nothing leaves `COMPLETED`

Anything moving backwards demands a written reason, because that is exactly the event the
portfolio dashboard is trying to explain.

Separately from the machine, `unmetHandoffRequirements` holds the _product_ rules: what has to be
true before a project can be handed to SHOPLINE. The machine says a move is shaped correctly;
the readiness check says it is earned.

---

## 4. Data

Full rationale in [`DATABASE.md`](DATABASE.md). The stance:

- **PostgreSQL + Prisma**, UUIDv7 primary keys, `Timestamptz(3)` everywhere, all values UTC.
- **Money as integer minor units.** A float is wrong by a cent eventually, and this is the number
  people argue about.
- **Check constraints are real and load-bearing.** A resolved blocker must carry a resolution; a
  paid invoice must equal its amount and have a paid date; only one stage visit and only one
  blocker-ownership span may be open at a time. Those two partial unique indexes are what make
  the time arithmetic safe.
- **Every multi-row mutation runs in a transaction**, and the audit row, the activity row and the
  outbox row are written inside it. The log cannot drift from reality, and an integration outage
  delays an update rather than losing it.

### Isolation boundary

This product is not multi-tenant in the agency sense — AHN and SHOPLINE share every project. The
boundary that matters is the **merchant**, and it is enforced two ways:

1. `projectScopeWhere(principal)` restricts a merchant principal to projects they hold a
   `ProjectMember` row for. Every read starts there.
2. The two route groups assert their audience in the layout: `(app)` refuses a merchant
   principal, `(portal)` refuses everyone else. Guessing a URL lands you back on your own
   surface, not on a narrowed version of somebody else's.

---

## 5. Queues

| Queue           | Produced by   | Concurrency | Purpose                                                  |
| --------------- | ------------- | ----------- | -------------------------------------------------------- |
| `integrations`  | any mutation  | 5           | Deliver one outbox row to Slack / ClickUp / email        |
| `notifications` | _nothing yet_ | 10          | Declared and consumed; unused (see below)                |
| `maintenance`   | repeatable    | 1           | Health, SLA sweep, invoice sweep, outbox retry, sessions |

**`notifications` is scaffolding, not a live path.** `apps/worker/src/processors/notifications.ts`
exists and the queue is declared, but nothing calls `enqueue('notifications', …)`. The in-app
`Notification` row is written directly and synchronously by `notify()`
(`apps/web/src/server/record.ts`), inside the same transaction as the change it describes -
exactly the pattern the queue's own design doc (D-015) describes, just without the queue hop. The
four notification types that also deserve an email (D-027) go through the `integrations` queue's
existing `EMAIL` branch, via the outbox, not through this one. Do not wire new work onto
`notifications` assuming it already fires; it does not.

Three things about the payloads are load-bearing, and they are the same three the previous
project settled on:

- **No content.** A job names a row; it does not carry its body. A job queued before an edit
  cannot deliver the stale copy, and message bodies never enter Redis.
- **No credentials.** Tokens are resolved at delivery time, never passed through a queue.
- **No trusted audience.** A notification payload names a _subject_, never a recipient list.
  It carries one identity field, `actorId`, used solely to stop telling someone about their own
  action — it can remove a recipient and never add one, which is what makes it safe.

### The outbox

Redis being unreachable must never fail a user's request. So a mutation writes its `OutboxMessage`
row **inside the same transaction as the change**, then nudges the queue. If the nudge fails it is
logged and swallowed; the `retry-outbox` maintenance task sweeps pending rows every two minutes.
Delivery failures back off exponentially and give up after six attempts, at which point the row
shows as `FAILED` on the Integrations page rather than disappearing.

A non-retryable failure — a revoked token, a channel the bot is not in — is terminal on the first
attempt. Retrying it forever only hides the problem from the people who can fix it.

---

## 5.5 File storage — `packages/storage`

A file attachment is a two-step handshake, not one call, and the split is the whole design:

1. **`requestUploadAction`** checks the declared MIME type against an allowlist
   (`@relay/core`'s `ALLOWED_ATTACHMENT_TYPES` — deliberately no SVG, so a stored attachment can
   never be opened as script; see D-029) and the declared size against a 25MB cap, then asks S3 for
   a **presigned POST**, not a presigned PUT. A PUT signature that pins `ContentLength` would force
   the upload to match that byte count exactly; a POST policy's `content-length-range` condition is
   what actually enforces an upper bound, at the bucket, before a byte is trusted (D-028). The
   browser then uploads straight to MinIO/S3 with that signature — the bytes never reach
   `apps/web`.
2. **`confirmUploadAction`** is where trust is earned. It reads the object's real, S3-reported size
   (`headObject`, never the client's claim), pulls back the first ~4KB (`readObjectHead`) and
   sniffs the actual magic number (`sniff.ts`). Only if that agrees with the declared type does the
   `Attachment` row get created; a mismatch deletes the object and nothing is ever linked to the
   project. The presigned key also carries the project id it was signed for
   (`project/{projectId}/{yyyy}/{mm}/{assetId}.{ext}`), and confirm checks that prefix against the
   project being confirmed against — a key obtained for one project cannot be attached to another.

A download never streams through `apps/web` either: `GET /api/attachments/[id]` is the only route
that ever sees a storage key. It re-runs the same `resolveProject` scope check every read goes
through, then redirects to a fresh 15-minute presigned GET — so `Attachment.url` (what a client
holds) is never the bucket, and a link a merchant cannot read 404s before a key is ever resolved.

---

## 6. The integration seam

Modelled on Orbit's `SocialProvider`: the portal contains **zero** Slack-specific or
ClickUp-specific logic. Callers deal in `SlackUpdate` and `ClickUpStatusUpdate`, never in Block
Kit or ClickUp status ids.

```ts
interface SlackProvider {
  health(): Promise<ProviderHealth>;
  listChannels(): Promise<ProviderResult<SlackDestination[]>>;
  postUpdate(update: SlackUpdate): Promise<ProviderResult>;
  fetchMessage(permalink: string): Promise<ProviderResult<SlackImportedMessage>>;
}
```

`packages/integrations/src/registry.ts` is the only place a platform is chosen: a token in the
environment selects the live adapter, its absence selects the mock. The mock answers locally and
records what it would have sent, so the whole flow — introduction email, Slack notification,
ClickUp status sync — is demonstrable and testable with no third-party credentials. Nothing above
the seam knows which one it got.

Platform error strings never reach a user unmapped; each adapter normalises them into a small
taxonomy carrying `retryable` and an optional `retryAfterMs`, which is exactly what the retry
policy needs.

---

## 7. Frontend

- **React Server Components by default.** Data fetching happens on the server against the scoped
  query; no endpoint is called from the browser just to render a page.
- **Server Actions for every mutation**, all going through `defineAction`.
- **Client components only where interaction demands it** — dialogs, filters, the theme toggle,
  the notification menu. They receive narrow, serialisable props, never a whole database row.
- **Tabs and filters are real links.** Project sub-views and filtered lists are addressable,
  shareable and back-button friendly, because people paste project links into Slack all day.
- **Required UI states are components, not ad-hoc markup**: `Loading`, `Empty`, `ErrorState`,
  `PermissionDenied`, `NotFoundState`. A feature without them is incomplete.
- **Status maps are total `Record<Status, …>`**, so adding a status is a compile error until
  somebody decides how it should look.

The design system is documented in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

---

## 8. Observability

Structured JSON logging with a per-request correlation id propagated into queue payloads, so one
update can be traced browser → action → outbox → worker → provider in a single query. A redaction
layer strips `token`, `secret`, `password`, `authorization` and the credential fields **by key
name**, so "never log a secret" is enforced by code rather than by remembering.

The worker exposes `/health` (liveness) and `/health/deep` (database reachability).

---

## 9. What was deliberately not built

Per the same instinct as the predecessor — when a simpler architecture is sufficient, prefer it:

- **No separate API service.** REST is unnecessary while the only client is the app itself; the
  domain lives in `packages/core`, so extracting one later is contained.
- **No event bus, CQRS or event sourcing.** The activity feed gives history, Postgres transactions
  give consistency.
- **No per-tenant database.** There is one shared portfolio by design; the merchant boundary is a
  scoped query and a route-group assertion.
- **No self-hosted infrastructure.** Managed Postgres, managed Redis, managed object storage.
