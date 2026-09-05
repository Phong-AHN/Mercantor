# Relay — Decisions

Recorded as they were made. Where a decision differs from AHN Orbit, the reason is stated.

---

**D-001 — A full pnpm monorepo, mirroring Orbit.**
Chosen by the client over a single Next.js app. The web app and the worker share the Prisma
client, the domain, the RBAC engine and the design system; duplicating any of those is how the two
halves drift.

**D-002 — Email + password with hashed sessions, not Firebase.**
Orbit used Firebase for identity. Here identity is one of eight roles inside two organisations,
authorization already lives in Postgres, and a second cloud dependency buys nothing. Passwords use
`scrypt` from Node's own crypto — memory-hard, no compiler on the deploy host, and the parameters
are stored in the hash so they can be raised later without invalidating anyone. Sessions are
stored as SHA-256 of the token, so a database read cannot be replayed as a login. The seam is
`packages/auth`; swapping in an identity provider is a contained change.

**D-003 — Integrations are interfaces with mock adapters, live behind one token.**
Modelled on Orbit's `SocialProvider`. It makes the whole flow demonstrable with no credentials,
and it keeps Slack's Block Kit and ClickUp's status ids out of the product.

**D-004 — `@relay/core` is browser-safe; Node-only helpers live in `@relay/core/server`.**
Orbit documented a trap where importing the core barrel from a client component typechecked and
then failed `next build`, because the barrel re-exported a module that imports `node:crypto`.
Splitting the barrel removes the trap rather than documenting it.

**D-005 — The whole workspace uses bundler module resolution and extensionless relative imports.**
Orbit ran NodeNext (`.js` extensions required) everywhere except two bundler-resolved packages,
and the mismatch was a documented footgun. Here everything is either bundled by Next or run
through `tsx`, both of which resolve extensionless TypeScript, so there is one rule.

**D-006 — Time attribution: an open blocker charges its owner, whatever stage it is in.**
The requirement asks for elapsed time _and_, separately, for delay ownership. Charging stage time
to the stage's owning team and then letting an open blocker override it is the only model that
answers both without double counting. Overlapping blockers are resolved first-opened-wins.
Implemented as interval subtraction; it is the most-tested code in the repository.

**D-007 — Health is derived, and the column is a cache.**
Storing health as truth lets it drift from the blockers and dates that justify it, and the whole
point of the portal is that the status on the screen is the status in reality. The column exists
so the portfolio list can sort and filter; it is recomputed in the same transaction as any change
and again every fifteen minutes.

**D-008 — Two partial unique indexes carry the time model.**
One open `StageEvent` per project, one open `BlockerOwnership` per blocker. Without them a
concurrent write leaves two open spans and the arithmetic double counts. With them the database
refuses, and the application's guarantee is structural rather than conventional.

**D-009 — Comment visibility is a query predicate, not a UI concern.**
"Internal AHN notes must remain private" is implemented by putting
`readableVisibilities(principal)` into the `where`. A note somebody cannot read is never fetched,
so it cannot leak through a serialisation mistake, a client component or an error page.

**D-010 — The merchant portal is a separate route group that refuses non-merchants, and vice versa.**
Orbit shipped a bug where a client user with a read permission reached an agency page and received
an agency-shaped payload; field narrowing alone was not enough. Both layouts assert their audience,
so guessing a URL lands you on your own surface.

**D-011 — Only AHN can mark access `VERIFIED`.**
A merchant can say "here are the credentials" (`RECEIVED`) or "these do not work" (`ISSUE`).
Received is not the same as working, and the handoff check depends on the difference.

**D-012 — Approvals are one-sided, enforced server-side.**
`canDecideApproval` routes each checkpoint to the side that owns it. SHOPLINE cannot approve QA;
AHN cannot approve deployment. An AHN project manager _can_ record the merchant's final approval,
because approvals arrive by email and on calls and refusing to record them means the portal stops
being the record — the row keeps who decided and who recorded it apart. Flagged as open question
O1 in `RBAC.md`.

**D-013 — The outbox is written inside the mutation's transaction.**
Redis being unreachable must never fail a user's request, and a Slack outage must not lose an
update. The row commits with the change; the enqueue is best effort; a two-minute sweep catches
anything the nudge missed.

**D-014 — Non-retryable integration failures are terminal on the first attempt.**
A revoked token or a channel the bot is not in will fail identically forever. Retrying hides the
problem from the person who can fix it; the row shows as `FAILED` on `/integrations` instead.

**D-015 — Notification payloads name a subject, never an audience.**
Recipients are resolved by the processor from live rows. The payload carries one identity field,
`actorId`, used solely to stop telling someone about their own action: it can remove a recipient
and never add one, which is why it is safe where a trusted recipient list would not be. Carried
over from Orbit's D-035/D-037.

**D-016 — Money is integer minor units end to end, and the project rollup is derived.**
Milestone billing is the normal case, so the project's invoiced / paid / outstanding figures are
computed from the rows rather than maintained alongside them.

**D-017 — The stage machine is permissive backwards, but demands a reason.**
Real migrations loop back to design and development constantly. Forbidding it would push the truth
out of the portal. Requiring a written reason turns each loop into the explanation the portfolio
dashboard needs.

**D-018 — Handoff readiness is a product rule, checked on the server, and shown early.**
The state machine says a move is shaped correctly; `unmetHandoffRequirements` says it is earned.
The same computation renders as a live checklist on the handoff tab, so a blocked button is
explained rather than mysterious. The submission stores a snapshot of the checklist as it stood.

**D-019 — Ageing thresholds live in a settings table, not a constant.**
The requirement calls them configurable. Both the app and the worker read them, so retuning them
is a form rather than a deploy.

**D-020 — Every mutation goes through one `defineAction` wrapper.**
Authenticate, authorize, validate, run — in that order, implemented once. A handler never sees raw
input and never builds its own principal, so it cannot skip a step.

**D-021 — The theme lives in `data-theme`, not in a class.**
Found during visual QA: React owns `<html>`'s `className` and rewrites it during hydration,
silently dropping the class the pre-paint script had added — the page flashed dark and reverted to
light. A data attribute React never renders is left alone. The inline script resolves "system" to
an explicit value, so one CSS selector covers every case.

**D-022 — Prisma generates into `node_modules`, with no custom `output`.**
Found during the first production build: a client generated outside `node_modules` makes Next's
file tracer walk up looking for `schema.prisma` and glob the user's home directory, which fails on
Windows junctions. The default output has no such problem.

**D-023 — The logger does not validate the environment at import time.**
Also found during the first production build: `next build` runs with `NODE_ENV=production`, where
`loadRootEnv` deliberately does nothing, so an eager `env()` turned every build into a deployment.
Processes that need configuration validate it at boot instead.

**D-024 — `pino-pretty` is only used by standalone Node processes.**
It runs in a worker thread, and Next bundles server code into `.next/server` where that worker
cannot resolve its own entry point. The web app logs newline-delimited JSON, which is what a
hosting platform wants anyway.

**D-025 — Attachments are links, and the file path is deliberately unbuilt.**
The model, the storage keys and the environment are in place. Assets arrive as shared Drive
folders today; a link is honest about that, and byte-level upload with real validation is a
contained addition rather than a half-finished one.

**D-026 — Integration tests call the real exported server actions, with only `next/headers`,
`next/cache` and `server-only` mocked.**
The alternative was testing an internal helper that mirrors an action's logic - which proves the
helper is right and says nothing about whether the action still calls it correctly. Three modules
need stubbing to make that possible outside a Next.js request: `next/headers` (the session cookie
`requirePrincipal` reads), `next/cache` (`revalidatePath`, a no-op with no request to invalidate),
and `server-only` (a package that assumes a bundler swaps it for a no-op on the server graph, and
throws unconditionally under plain Node). Everything else in the chain - Prisma, the RBAC engine,
zod validation, the transaction - is the real thing, against the real Postgres `pnpm infra:up`
starts. `apps/web/test/fixtures.ts` types its `TestUser` as the actual `Principal` rather than a
lookalike; a first draft that only had `id`/`email`/`name`/`role` passed every permission check by
accident (`can()` reads `isActive`, undefined is falsy) and silently narrowed what a "principal"
could read - a test-only bug that would have hidden the very boundary it existed to prove.

**D-027 — Four notification types also queue an email, through the existing outbox, decided in one
place.**
`notify()` (`apps/web/src/server/record.ts`) is called from every feature that raises a
notification, and it was already the single place recipients get resolved. Adding email delivery
there - rather than in each of the dozen call sites - keeps every call site unaware of the
decision, exactly like the Slack fan-out. The allowlist is narrow on purpose: `LAUNCH_BLOCKER`,
`APPROVAL_PENDING`, `SHOPLINE_READY`, `DEPLOYMENT_APPROVAL` - the four cases where somebody away
from the portal genuinely needs to know now, not the eleven the brief lists as candidates for a
notification at all. Delivery reuses the outbox's existing `EMAIL` branch in
`apps/worker/src/processors/integrations.ts`, which the introduction email had already proven out;
nothing new was built on the worker side.

One correction made while building it: `notify()` previously wrote every recipient's row with a
single `createMany({ skipDuplicates: true })`, which cannot report which rows were genuinely new
versus silently skipped as duplicates of an existing `dedupeKey` (the SLA sweep's daily nags rely
on that dedupe). Emailing on a skipped duplicate would re-send the same nag on every retry of the
sweep. `notify()` now upserts per recipient and only emails a row whose `createdAt` still equals
the call's own clock reading - proof it was actually inserted, not matched to an existing one. A
plain `dedupeKey: null` (every one-off, non-sweep call) always counts as new, matching the previous
behaviour exactly, because Postgres never treats two `NULL`s as a duplicate under a unique
constraint. One further wrinkle surfaced fixing this: Prisma 6's generated compound-unique `where`
input for `[userId, dedupeKey]` types `dedupeKey` as a bare `string`, not `string | null` - it
cannot target a `NULL` row through that field at all, even though Postgres itself would allow the
`IS NULL` filter. The `null` case is therefore a plain `create`, never an `upsert`.

**Explicitly not the `notifications` BullMQ queue.** `apps/worker/src/processors/notifications.ts`
and its queue exist in the codebase but nothing has ever called `enqueue('notifications', ...)` -
every actual notification write goes through `notify()`'s direct, synchronous path inside the
mutation's own transaction. Wiring email onto the unused queue would have shipped a feature that
looked complete and did nothing. The queue is left in place rather than deleted, since removing
infrastructure is outside this change's scope, but it should not be mistaken for live code.

**D-028 — File upload is built. It supersedes D-025's link-only path with a presigned POST, not a
presigned PUT.**
A presigned `PutObjectCommand` that includes `ContentLength` folds it into `SignedHeaders` - the
upload then has to match that byte count _exactly_, which would reject every file smaller than the
25MB cap, not enforce "at most". S3's actual mechanism for an upper bound on a direct-to-bucket
upload is a POST policy's `content-length-range` condition, enforced by the bucket itself before a
byte is trusted (`packages/storage/src/presign.ts`). The browser never routes the bytes through
this server either way; the server hands out a signature and fields, `FileUploadButton` posts
straight to MinIO, and only then does the confirm step run.

**D-029 — The declared MIME type only decides what gets offered for upload; the row everyone else
sees is never created on declared type alone.**
`requestUploadAction` checks the client's declared type and size against `ALLOWED_ATTACHMENT_TYPES`
purely to avoid handing out a signature for garbage - that check trusts nothing yet, because
nothing has been written. The bytes that actually land in the bucket are sniffed by magic number
(`packages/storage/src/sniff.ts`) inside `confirmUploadAction`, and a mismatch deletes the object
and returns a validation error; the `Attachment` row is created after that check passes, not
before. SVG stays off the allowlist entirely (carried over from D-025's reasoning): a browser
renders an SVG opened with a plain `<a target="_blank">` as an HTML document, script tags included,
and no byte-sniff makes that safe to open. The confirm step also checks the presigned key's
`project/{id}/` prefix against the project the caller is confirming against, so a client cannot
present a key that was signed for a different project it also has upload access to.

**D-030 — `Dialog` mints its own title id with `useId()`, and so do `AttachLinkButton` and
`FileUploadButton`'s field ids.**
Found while smoke-testing the upload flow: `Dialog` hardcoded `id="dialog-title"`, and both
attach-a-file-to-this-row buttons hardcoded their field ids. Neither is a bug in isolation - it is
one the moment a checklist (assets, access) renders more than one row, because every row mounts its
own `Dialog` (open or not), and the same literal id appears once per row. `aria-labelledby` and
`<label for>` then resolve to the _first_ matching id in the DOM, not the open dialog's own, so a
screen reader announces the wrong dialog title for every row but the first. `useId()` gives each
component instance its own stable, unique id, which is what a component meant to be rendered many
times on one page has to use for anything an `id` attribute touches.

**D-031 — Approving a change request is gated by `invoice:manage`, not `scope:manage`, and
creates its invoice line atomically, in the same transaction as the approval.**
`updateScopeItemAction` already let any AHN delivery role price a change request - `scope:manage`
is broad, held by developers and PMs alike, because deciding what is in or out of scope is a
delivery call. Agreeing to be paid for it is not: `invoice:manage` is narrower (AHN admins and
PMs only, per the existing matrix), the same distinction D-012 draws between approvals generally.
The invoice line is created inside `approveChangeRequestAction`'s own transaction rather than as a
separate "now generate the invoice" step, because an approved change request with no billable
line is not a state this product wants to be able to represent - the two facts must always agree.
`Invoice.scopeItemId` is a nullable, unique FK back to the `ScopeItem` (most invoices are not
change requests, and a change request has at most one invoice), and there is deliberately no
"un-approve": correcting a wrong price means editing the invoice directly, the same way any other
invoice is corrected.

**D-032 — Threaded replies group the flat, already-filtered comment list client-side; the write
path needed nothing new.**
`Comment.parentId` and `postCommentAction`'s validation that a parent belongs to the same project
already existed in the original build - what was missing was purely the read side, which had
never rendered a thread. Grouping happens once, from the same RBAC-scoped list every comment
screen already fetches: a reply whose parent this viewer cannot see (a visibility mismatch nothing
stops at write time, however unlikely in practice) renders as its own top-level item rather than
disappearing - the query already decided what this viewer may read, and grouping is not a second
place to re-decide that (D-009's principle, applied one layer up). `CommentComposer` grew a
`compact` mode for a reply box rather than a second, parallel form: same action, same visibility
rules, fewer controls (no category, no Slack) because a reply is not a new top-level update.

**D-033 — A comment's "attach a file" button is gated by `asset:upload`, not `comment:create`.**
The same mismatch D-030's issues-page fix already found: every role that can post a comment can
also reply, but SHOPLINE roles hold `comment:create` without `asset:upload`. Rendering the button
for anyone who could post a comment would offer an action that always fails for a SHOPLINE
principal. `Attachment.commentId` was already in the schema and `confirmUploadAction` already
accepted it - the gap was wiring `FileUploadButton` into the comment row at all, gated on the
correct permission this time.

**D-034 — The portal's approvals page is one ordered pipeline, not three separately-shaped
groups, and it now shows `SHOPLINE_DEPLOYMENT`.**
The previous version filtered `SHOPLINE_DEPLOYMENT` out of the merchant's view entirely, alongside
their own `MERCHANT_FINAL` row, leaving a merchant able to approve the store but with no visibility
into whether SHOPLINE had actually deployed it afterwards - arguably the one status they care about
most. All five checkpoint types now render, in the order work happens in, with the merchant's own
actionable one still pulled out on top for visibility and its controls. "What has been approved"
is now a single scan down one list rather than three differently-organized cards.

**D-035 — `ProjectLink` takes a `linked` prop; five call sites were nesting one `<a>` inside
another.**
The `/dashboard` hydration mismatch noted in the previous handoff, chased down: `ProjectLink`
always rendered its own `next/link`, and five list rows (dashboard's "needs attention", the
portfolio approvals and handoffs pages, "my work") already wrapped the whole row in its own
`Link` for a click-anywhere-in-the-row affordance. An anchor cannot contain another anchor: HTML
parsing implicitly closes the outer one when it meets the inner one, so the DOM the browser
actually builds differs from the one React's server render describes, and React tears down and
regenerates the mismatched subtree on hydration - silently, with no visible symptom, which is
exactly why five instances of it shipped unnoticed. The fix is `linked={false}`: the row's own
`Link` still owns the click and the hover background; `ProjectLink` renders the same markup as a
plain `<div>` instead of a second anchor. The four table-row usages (blockers, invoices, issues,
the portfolio table) were never affected - a `<tr interactive>` is a CSS class, not a wrapping
anchor, so `ProjectLink` there was always the only link in its row.

**D-036 — Creating a ClickUp task from an issue reuses the project's existing linked task; there
is no separate "which list" setting.**
`ClickUpTaskDraft.listId` is required by ClickUp's own API, and nothing in the schema previously
had anywhere to keep one - `IntegrationLink` links a project to one task, not a list, and there is
no UI to configure a project's integration at all (only a read-only display; the seed script is
the only writer). Rather than invent a new settings surface for one field, `getTask` on the
project's already-linked task now also returns the list it lives in, and the new task is created
as a subtask of that task (`parent` in the create call). One link is enough for both stage sync
and task creation - a `listId` is derived, never configured a second time. Not the outbox: the
point of clicking the button is to see the result (or why it failed) immediately, the same
reasoning `recordSlackMessageAction` uses for pulling a message in from Slack. `Issue.clickUpTaskId`
/ `clickUpTaskUrl` are set once and never cleared; correcting a wrong task means acting in ClickUp
directly, the same as any other external system of record.

**D-037 — The integration harness gained its first worker-processor test, and it cannot reuse
`apps/web/test/fixtures.ts`.**
Invoice payment arithmetic (`recordPaymentAction`) is a normal server action and slotted into the
existing pattern without incident. The SLA sweep's per-day dedupe (`slaSweep`, in
`apps/worker/src/processors/maintenance.ts`) is not: it is the harness's first test of worker code
rather than a web server action, and two things about it do not fit the established shape.
First, `apps/worker`'s `tsconfig.json` scopes `rootDir` to its own `src` - importing
`apps/web/test/fixtures.ts` from there fails to type-check (`TS6059`, files outside `rootDir`),
and the fixtures pull in the `@` alias and `next/headers` mocking that only make sense inside
`apps/web` anyway. The fix is the same one `packages/db/src/transaction.integration.test.ts`
already uses for testing outside `apps/web`: build the minimal rows directly with `db.*.create()`,
no action layer involved. Second, `slaSweep()` is deliberately whole-database, not
project-scoped - a real sweep has to nag about every stuck project, not one at a time - which
means a test run also writes notifications for every seeded demo project, not only its own
fixture. `setClock(fixedClock(...))` to a specific future date turns that into something safely
cleanable: the test's `afterEach` deletes every `Notification` whose `dedupeKey` contains that
frozen date, anywhere in the table, which is precise (no real sweep run today can produce a 2026
date that far out) without needing to enumerate every project the sweep might have touched.

**D-038 — Automated approvals only automate the _request_, never the decision; it is a stage-move
side effect, not a separate rule engine.**
Phase 2's "automated approvals" is one line in the brief with no further detail, and the wrong
reading of it would be dangerous: a `MERCHANT_FINAL` sign-off is a legal-adjacent judgment call, not
something software should grant on someone's behalf. What is safe and genuinely useful to automate
is the administrative half - remembering to _ask_. `submitHandoffAction` already auto-requests
`SHOPLINE_DEPLOYMENT` this way; `autoRequestApprovals` (`apps/web/src/features/projects/mutations.ts`)
generalises the same idea to the three earlier checkpoints, triggered by `advanceStageAction` moving
into the stage where each one becomes due: `MERCHANT_DESIGN_REVIEW` → DESIGN, `INTERNAL_QA` →
DEVELOPMENT, `MIGRATION_VALIDATION` → QA and MERCHANT_FINAL together. `requestedById` and the
activity/audit rows are attributed to nobody (`null`) rather than to whoever happened to move the
stage - the stage change caused it, not a person's decision to request it, and attributing it to
the mover would misrepresent the audit trail. It never overwrites a `PENDING` or `APPROVED` row,
but a `CHANGES_REQUESTED` or `REJECTED` one is re-requested on re-entering the stage - a rework
loop earns a fresh review, not a stuck one. Lives beside `moveStage` in `mutations.ts` rather than
inside it: `moveStage` is deliberately the bare state-transition primitive (every one of its five
call sites owns its own notifications and side effects already), and this is a product rule of the
same kind `unmetHandoffRequirements` already is, not a mechanism the primitive itself should know
about.

**D-039 — Slack delivery for urgent notifications resolves the recipient by email at delivery
time; nothing about Slack identity is ever stored.**
The four notification types urgent enough to also email someone (D-027) now also DM them in
Slack - the same allowlist, renamed `URGENT_NOTIFICATION_TYPES` since it no longer names only one
channel. The obstacle was identity: nothing in the schema maps a `User` to a Slack account, and
building a settings screen to collect one by hand is exactly the kind of new configuration surface
D-036 already argued against for a similar problem. Slack's `users.lookupByEmail` makes that
unnecessary - every AHN and SHOPLINE user already has a real work email, and Slack accounts are
provisioned against the same one. `queueUrgentNotificationDeliveries` (`apps/web/src/server/record.ts`)
queues a `SLACK` outbox row carrying the recipient's **email**, never a Slack id; `apps/worker`
resolves the id fresh at delivery time (`SlackProvider.findUserByEmail`), the same "no credentials
through the queue" reasoning D-015 already applies to tokens. Someone with no matching Slack
account is a normal, expected outcome, not a failure worth retrying six times and surfacing as
red on `/integrations` - `ProviderResult` grew an optional `skip` flag for exactly this, and
`processIntegration` now marks that row `SKIPPED` (a status the schema and the Integrations page
already had, unused, since the outbox was first built) rather than `FAILED`.

**D-040 — Portfolio CSV export reuses `parseFilters` + `listProjects` verbatim; it is not a second
reporting query.**
A route handler (`apps/web/src/app/api/projects/export/route.ts`), not a server action, since the
response is a file with its own content type and `Content-Disposition`, not a redirect-or-result
pair `defineAction` is shaped for - the same reasoning D-028's presigned download route already
follows. It reads the same query string the `/projects` page puts filters into, runs it through
the exact `parseFilters` and `listProjects` the page calls, and gates access with the same checks
the table already makes: `project:read` for the export at all, `invoice:read` (the table's own
`showMoney` flag) for whether the six money columns are included. A separate reporting query would
inevitably drift from what the screen shows - a filter added to one and not the other, a column
renamed in one and not the other - and "the exported file matches what you were just looking at"
is the entire point of the feature. `buildProjectsCsv` (`apps/web/src/features/projects/csv.ts`) is
kept pure and separate from the route for the same reason `renderNotificationEmail` and
`sniffMimeType` are: a unit test can cover CSV-escaping edge cases (an embedded comma, quote, or
CRLF) without touching the database. Money is written as a plain decimal string (minor units
divided by 100, `toFixed(2)`), not a locale-formatted currency string - a spreadsheet formula can
sum the column directly. The "Export CSV" link in `filters-bar.tsx` is a plain `<a>`, not
`next/link`'s `Link`: it triggers a real file download from an API route, not a client-side
navigation, and `next/link` would prefetch and soft-navigate a URL that was never meant to render
a page.

**D-041 — Formal SLA breach records: a `SlaBreach` table alongside the live figures, opened by
whichever recompute already knows the crossing and closed by `moveStage`, the one place that knows
the exact instant a stage is actually left.**
`ProjectTime` already answers "is this over target right now" (`currentStageOverTarget`,
`onSchedule`) - what Phase 2 asks for is a durable answer to "was this ever over target, and for
how long", which a live-only figure cannot give once the moment passes. `detectOpenBreaches`
(`packages/core/src/sla.ts`) is a small pure function over the `ProjectTime` already computed -
not a second pass with its own chance to disagree with `currentStageOverTarget` - and it backs out
`startedAt` from data already on hand (`currentStageEnteredAt + currentStageTargetMs`, or the
target launch date itself) rather than the moment a sweep happened to notice, so a breach detected
a day late still records when it actually began.

Two partial unique indexes carry the "one open breach" guarantee, the same pattern D-008 already
uses for `StageEvent`/`BlockerOwnership`: at most one open `STAGE_OVERRUN` per project per stage,
at most one open `LAUNCH_OVERRUN` per project. A check constraint enforces `resolvedAt >=
startedAt` and that `stage` is set if and only if `kind = STAGE_OVERRUN`.

Opening and closing are split across three call sites, each the one place that actually knows the
fact in question:

- **Both worker's `recomputeHealth()` (every 15 minutes) and the transactional
  `recomputeHealth(tx, projectId)` (inside almost every mutation) open new breaches**, via the same
  `detectOpenBreaches`. This mirrors D-007's own reasoning for the health column exactly: a project
  can go over target purely because time passed, which the 15-minute sweep exists to catch, but a
  change that makes one true right now (backdating a target launch date, say) should not have to
  wait fifteen minutes to show up as a formal record any more than the health column should.
- **`moveStage` closes a `STAGE_OVERRUN`** the instant its stage is exited, and a `LAUNCH_OVERRUN`
  the instant the project reaches `COMPLETED` - both plain `updateMany` calls that no-op when
  nothing is open. No sweep is asked to guess when a stage ended; `moveStage` already knows.
- **Both `recomputeHealth`s also resolve a `LAUNCH_OVERRUN`** whose target date was pushed back out
  (the only way a launch breach stops applying without the project moving at all), clamped to never
  set `resolvedAt` before the row's own `startedAt` - real production time only moves forward, but a
  test that freezes the clock to a date earlier than a breach a live process already opened can hit
  exactly that ordering, and the constraint would otherwise reject the write outright rather than
  let the sweep continue. The transactional recompute skips this reconciliation entirely once the
  project is `COMPLETED` - the worker's own query already excludes completed projects for the same
  reason, and without the guard a project that finished late would have `moveStage` close its launch
  breach and the very next line reopen it, since a completed project is still, correctly, over
  target forever.

Two bugs surfaced building this, both from the same kind of gap: a value assumed to be there that
the code never actually asked for. The worker's bulk pre-fetch of already-open breaches selected
only `id, projectId, kind, stage` - not `startedAt` - so the very comparison meant to protect
`resolvedAt >= startedAt` was comparing against `undefined`, silently taking the "clamp" branch
that does nothing. And the first version of the transactional recompute had no `COMPLETED` guard at
all, reopening the launch breach `moveStage` had just closed, in the same transaction, for any
project that finished after its target date - which is the common case, not an edge case, for a
demo dataset with several intentionally-overdue seeded projects.

Surfaced live, not only by the constraint: `scripts/sla-breach-smoke.mjs` cannot fabricate an
overdue project by creating a throwaway one - `Project_target_after_start` correctly refuses a
target launch date before a project's own start date, and a brand-new project's start date is
"now". It instead uses the seeded `PRJ-0003` (already 12 days overdue, 48 days into Waiting for
Access, by design), captures its target launch date, and restores it afterward - the only smoke
script that reads and writes seeded data rather than either creating its own project or only
reading, because this is the one feature that cannot be demonstrated any other way.

**D-042 — Analytics trends reuse `listProjects` and derive everything from columns that already
exist; the only new surface is two chart primitives, and a real layout bug in them was caught by
looking at the rendered page, not by any test.**
Phase 2's last item, scoped down from "analytics" in general to trends over time specifically,
since the dashboard already is a complete snapshot of right-now - health split, ageing, average
durations - and a second snapshot page would just be the same numbers restated. What a snapshot
cannot answer is "is this getting better or worse", which is the whole point of a trend. No new
schema: `/analytics` buckets `Project.startDate` / `actualLaunchDate` / `completedAt` and
`SlaBreach.startedAt` into calendar months via `trailingMonths`/`bucketOf`
(`packages/core/src/analytics.ts`, pure and unit-tested - month-rollover and year-boundary
arithmetic is exactly the kind of off-by-one a hand-rolled date computation gets wrong once and
never again). The project list itself is `listProjects(principal, { includeCompleted: true })` -
the same call `getPortfolioSummary` already makes for the dashboard - not a second query that could
count a project the portfolio screen would not; `ProjectListItem` gained `actualLaunchDate` and
`completedAt` (the columns were already in `listSelect`'s Prisma query, just never projected onto
the returned shape) rather than inventing a parallel read path for two fields.

No chart library exists in the workspace, and two trend charts did not earn one: `TrendBarChart`
and `TrendLineChart` (`packages/ui/src/chart.tsx`) are plain SVG/flexbox, using the design system's
existing `Tone` colours (fixed series assignment, e.g. `started` is always `accent`, `launched`
always `success` - never re-picked when a filter changes what is visible) rather than a separate
palette invented for charts alone. The hover layer is a native `title` attribute on each mark, the
same minimal approach `SegmentedBar` already used for its own hover detail - neither chart needed
client-side state for it.

Two things were wrong on the first pass, and neither would have been caught without actually
rendering the page:

- **The bar chart's outer row used `items-end`** so its bars sit at the bottom - but that also
  stops flexbox from stretching each month's column to the container's height, so every bar's
  `h-full` resolved against an `auto` (zero) height and the whole chart rendered as an empty card
  with a legend underneath, despite the headline stats showing real numbers. Every test that
  existed at that point passed - the data was correct, only the CSS was wrong. Fixed by stretching
  the row (`items-stretch`) and giving the bar-area a `flex-1` height instead of `h-full`, so the
  label below it can still claim its own space.
- **The design system's dark-mode tone tokens sit slightly above the dataviz palette validator's
  ideal lightness band for chart marks on a dark surface** (`node scripts/validate_palette.js`,
  loaded from the `dataviz` skill) - a real finding, but about tokens every status pill and badge in
  the app already uses, not something this feature introduced or should silently "fix" as a side
  effect. CVD separation and contrast against the surface both pass in both modes; only the
  stylistic lightness-band check misses, which is a design-system-wide judgment call outside this
  change's scope.

The validator also flagged the warning/danger pair used for the SLA-breach chart with a contrast
WARN in light mode (an amber under 3:1 against the card surface) - "not dismissable" per the
skill, requiring a relief channel. Both `TrendBarChart` and `TrendLineChart` already had a legend
and hover tooltips, but neither puts the actual value in a text token near the mark, so a direct
value label (selective - non-zero bars only, in `text-ink-soft`, never the series colour) was added
above each bar, which is the fix the skill calls for and a small usability improvement on top,
verified against a real screenshot in both themes.

**D-043 — A full manual review of D-031 through D-042, once every item in the brief was built.**
With nothing left in the original plan, and no git history yet to give `/code-review` a diff to
work from (`git init` plus one baseline commit fixed that for future changes, but not for reviewing
everything that led up to it), a subagent read every feature's implementation against its own
decision entry and reported findings by hand instead. Five were real, each verified by reproducing
the exact failure path before it was trusted, then fixed and covered by a new test - not reported
and left for later.

1. **A rejected approval's reason survived its own re-request.** `autoRequestApprovals`
   (`apps/web/src/features/projects/mutations.ts`) reopens a `CHANGES_REQUESTED` or `REJECTED`
   approval as `PENDING` on re-entering the stage (D-038), but its `upsert`'s `update` branch never
   touched `notes` - unlike the manual path, `requestApprovalAction`, which always clears it. A
   `CHANGES_REQUESTED` note ("the header logo is wrong") stayed attached and rendered under the
   fresh `PENDING` status on both the AHN and portal approval pages, indistinguishable from a live
   note on the new cycle. Fixed with one line (`notes: null`); the existing rework-loop integration
   test already re-requests an approval after a rejection, so it only needed the assertion added.

2. **A reply to a reply was accepted, stored, and then never rendered - to anyone, ever.** D-032
   says a reply "can itself be replied to"; the UI's "Reply" button rendered on every comment row
   including a reply, with no depth check, and `postCommentAction` only checks a parent is on the
   same project. But `CommentThread` (`comment-thread.tsx`) only ever looked up
   `repliesByParent.get(topLevelComment.id)` - a reply's own entry in that map was built correctly
   by `groupThreads` and then never queried by anything. The write succeeded, the data was correct,
   and the second reply simply vanished from view for every viewer, forever. Fixed by making
   `CommentRow` recursive - it now renders its own `repliesByParent.get(comment.id)` nested inside
   itself, at any depth, the same bordered/indented treatment one level deeper each time.
   `scripts/thread-smoke.mjs` had already been asserting the "Reply" button exists on a reply, which
   is exactly why this shipped unnoticed: existence of the affordance was checked, not that using it
   actually renders something. It now posts through it and asserts the grandchild reply appears -
   and its own `replyItem` locator turned out to need `.last()` instead of `.first()`, since a
   reply's `<li>` nests inside its parent's, so a plain `hasText` match resolves the parent `<li>`
   first.

3. **A file attached to an `INTERNAL_AHN` comment announced itself to everyone anyway.**
   `confirmUploadAction`'s `recordActivity` call hardcoded `visibility: 'EVERYONE'` for every
   attachment target, comments included. D-009's whole point is that an internal note's contents
   never reach SHOPLINE or the merchant - but the activity row for a file dropped onto one said
   "File attached: <label>" at `EVERYONE`, appearing on every feed regardless of who could see the
   note it was attached to. The label alone is enough to leak what an internal conversation is
   about. Fixed by looking up the parent comment's own `visibility` inside the same transaction and
   using that instead - which also needed a same-project check on the comment id, the same
   ownership guard the presigned storage key already gets, since nothing had verified that before.

4. **A rate limit during a Slack lookup was marked exactly like "this person has no Slack
   account" - permanently, never retried.** `deliver()`'s `notification_dm` branch
   (`apps/worker/src/processors/integrations.ts`) set `skip: true` for any lookup failure at all.
   `ProviderResult.skip` exists specifically for the expected, harmless case (D-039); a transient
   `UNAVAILABLE` from Slack's API is `retryable: true` on the exact same shape and was being treated
   identically - `SKIPPED` is a terminal status the two-minute retry sweep never revisits, so a
   launch-blocker DM lost to a momentary rate limit was gone for good, not merely delayed. Fixed by
   checking `error.retryable === false` before treating a lookup failure as a skip, extracted into
   `isPermanentSlackLookupFailure` so the one-line decision has its own name and its own unit test
   rather than living unnamed inside a conditional.

5. **`slaSweep`'s daily approval nag never got the urgent delivery its own type promises.**
   `APPROVAL_PENDING` is in `URGENT_NOTIFICATION_TYPES` (apps/web/src/server/record.ts) - meant to
   also reach someone by email and Slack DM, not only as an in-app row. But `slaSweep`
   (`apps/worker/src/processors/maintenance.ts`) writes its notifications with a bulk
   `db.notification.createMany(...)` directly, never through `notify()`, so a stale pending
   approval nagged about daily by the sweep never got the "urgent" half of urgent at all - only the
   one raised at request time did. `apps/worker` cannot import `apps/web`'s server helpers (the same
   boundary D-037 already hit for its test fixtures), so rather than a cross-package refactor, the
   sweep now splits its queued notifications, bulk-inserts the non-urgent ones unchanged, and
   upserts `APPROVAL_PENDING` ones individually - the same freshness-by-timestamp trick `notify()`
   uses - to learn which are genuinely new before queuing an email and a Slack DM for exactly those.
   The duplication with `queueUrgentNotificationDeliveries` is deliberate and cross-referenced in
   both places rather than hidden; unifying it into one shared package is a real improvement but a
   larger, separate change than a review pass should make opportunistically.

All five are covered by a new or extended test - three integration (`actions.integration.test.ts`,
`attachments/actions.integration.test.ts`, `maintenance.integration.test.ts`), one unit
(`integrations.test.ts`), and one live browser check (`thread-smoke.mjs`) - and `pnpm verify`,
`pnpm test:integration`, both production builds, and the full smoke-script suite were all re-run
clean afterward.
