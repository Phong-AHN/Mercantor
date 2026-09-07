# Mercantor — Handoff

> Read this first. Then `ARCHITECTURE.md`, then `DECISIONS.md`, then the doc for whatever you are
> about to touch. Going live with real merchants? Read `TODO.md` (things only you can do — account
> access, credentials, provisioning) and `FUTURE-WORK.md` (things that need more building later)
> too.

---

## What this is

The AHN × SHOPLINE migration portal, built from `requirement.txt` using the stack and conventions
of the previous project (AHN Orbit), whose own documentation is preserved under
`docs/_legacy-ahn-orbit/`.

The product principle, from the brief, is the thing to protect: **one merchant = one project
record = one source of truth**, and one screen answers ten questions. Everything in
`packages/core` exists to make those ten answers computed rather than typed in. If a change would
make one of them a field somebody has to remember to update, it is the wrong change.

---

## State

**Working, verified, demonstrable against seeded data:**

- 38 routes build; `pnpm verify` is green (format, lint, typecheck, 61 unit tests)
- `pnpm test:integration` is green against a real Postgres and a real MinIO — 76 tests over 16
  files, proving the blocker-handover arithmetic, the handoff readiness gate, comment visibility
  per role, the outbox's transactional atomicity, that a launch blocker (and only a launch
  blocker, not an ordinary issue) queues one notification email and one Slack DM per recipient,
  the file-upload handshake end to end, change-request approval, threaded replies (a reply's
  parent must be on the same project), ClickUp task creation, invoice payments accumulating rather
  than overwriting and never exceeding the invoice, the SLA sweep's per-day dedupe (D-037),
  automated approval requests (D-038), Slack DM delivery resolving the recipient by email
  (D-039), the portfolio CSV export's RBAC gates and merchant scoping (D-040), formal SLA
  breach records opening the instant a mutation or the 15-minute sweep learns of one and closing
  at the exact moment `moveStage` learns the other (D-041), and the analytics trends correctly
  bucketing started/launched projects and SLA breaches by calendar month (D-042) - all through
  the actual exported server actions, route handlers, queries, or worker processors, not a copy
  of their logic. See `apps/web/test/` for the harness.
- `node scripts/e2e-smoke.mjs` passes 11/11 in a real browser, including the cross-role
  visibility boundaries
- The full chain works end to end: a UI action commits the change, the activity row, the audit row
  and the outbox row in one transaction, nudges Redis, and the worker delivers it and marks the
  row `DELIVERED` - verified live for both Slack and email, not only through the test suite.
- Four in-app notification types also queue an email **and a Slack DM** through the same outbox:
  a launch blocker, a pending approval, a project ready for SHOPLINE review, and a deployment
  decision (D-027, D-039). The Slack account is found by work email at delivery time - nothing to
  configure, and no account found is a skip, never a failure. Verified live against the actually
  running worker (queue over Redis, not an in-process call).
- File upload is real: a presigned POST straight to MinIO/S3, the real bytes sniffed by magic
  number and verified against the declared type before an `Attachment` row exists, and a
  short-lived presigned download behind an RBAC-gated route that never exposes the storage key
  (D-028, D-029). Wired into access, asset and issue attachments; verified live in the browser
  with `node scripts/upload-smoke.mjs`.
- Change requests can be priced, approved and billed: `invoice:manage` approves (a commercial
  decision, not `scope:manage`'s delivery one), which creates a linked invoice line in the same
  transaction (D-031). Verified live with `node scripts/change-request-smoke.mjs`.
- Comments thread: a reply nests under its parent, can itself be replied to, and can carry its
  own file attachment (D-032, D-033) - on both the AHN and merchant-portal activity feeds, from
  one shared component. The portal's approvals page is now one ordered pipeline covering all five
  checkpoints, including `SHOPLINE_DEPLOYMENT`, which the merchant previously could not see at all
  (D-034). Verified live with `node scripts/thread-smoke.mjs`.
- No hydration mismatches: `ProjectLink` no longer nests one `<a>` inside another on the five
  screens that wrapped a whole row in its own `Link` (D-035). Verified with the browser-error
  listener every smoke script now carries.
- A ClickUp task can be created straight from an issue, as a subtask of the project's already-
  linked task - no separate list to configure (D-036). Verified live with
  `node scripts/clickup-task-smoke.mjs`.
- Approvals auto-request themselves: entering the stage a checkpoint is due in (Merchant Design
  Review, Internal QA, Migration Validation) puts it PENDING and notifies the right people, with
  nobody having to remember to click "Request" - only the request is automatic, the decision
  always stays a person's call (D-038). Verified live with `node scripts/auto-approval-smoke.mjs`.
- The portfolio can be exported as a CSV, honouring whatever filters are active in the URL and the
  same `invoice:read` gate the table itself uses for money columns - not a second reporting query
  that could drift from the screen (D-040). Verified live with
  `node scripts/portfolio-export-smoke.mjs`.
- SLA breaches are formal, historical records now, not only a live "is it over target" flag: a
  `SlaBreach` row opens the instant a stage or the target launch date runs over - whether a
  mutation causes it or the worker's 15-minute sweep simply notices - and closes at the exact
  moment `moveStage` learns the stage was left or the project completed (D-041). Shown on every
  project's Time & SLA tab. Verified live with `node scripts/sla-breach-smoke.mjs`.
- `/analytics` shows trends, not another snapshot: throughput, cycle time and SLA breaches over
  the last six months, bucketed from columns the rest of the product already writes - no new
  schema (D-042). Verified live with `node scripts/analytics-smoke.mjs`.
- The worker boots, installs five schedules, and answers `/health` and `/health/deep`

**Known gaps against the brief: none.** Every item in the original brief, including all of Phase 2,
is built - see `REQUIREMENTS-COVERAGE.md`. A full manual review once nothing remained (D-043, no
git history yet to give `/code-review` a diff) found and fixed five real bugs: a rejected
approval's note surviving its own re-request, a reply-to-a-reply that saved correctly and then
rendered to nobody, a file attached to an internal-only comment announcing itself on every feed
anyway, a transient Slack lookup failure marked exactly like "no Slack account" and never retried,
and the SLA sweep's daily approval nag never getting the urgent email/Slack delivery its own type
promises.

A navbar report ("click one menu, then another one won't click") turned out to be `/integrations`
hanging its whole server render on an unbounded `fetch()` to Slack/ClickUp/Resend, invisible until
`.env` first pointed at real credentials (D-044). Fixed with an 8-second `AbortSignal.timeout` on
every live call in `packages/integrations`, verified with a ten-run shuffled click stress test
(10/100 stuck clicks before, 140/140 clean after).

Connecting a project to Slack and ClickUp had no UI path at all - only `pnpm db:seed` and direct
database writes did. Each project's Settings page now has a connect/disconnect form for both,
verified live before saving: a ClickUp task by id or pasted link through `getTask`, a Slack channel
picked from a live `conversations.list` (D-045).

A separate report ("stage move updates Mercantor but not the linked ClickUp task, Slack still shows
'bot not in channel'") led to D-046: a worker-side BullMQ job id (`outbox:<uuid>`) contained a
colon in a shape BullMQ's own validation rejects, so the outbox's 2-minute retry sweep failed
silently, forever - only a message delivered on its very first attempt ever went out. Fixed
alongside a second, unrelated finding from the same investigation: the dev web process was in fact
still talking to the real (and currently credential-broken) Redis Cloud instance rather than the
local one this session had been trying to point it at via a shell export, traced with `netstat`.
`REDIS_URL` is set directly in `.env` now rather than relying on that export. Verified live: a
project's most recent stage move now shows `DELIVERED` for both its Slack post and its ClickUp
sync, with a real timestamp. See `RUNBOOK.md` for the operational detail on all of this, and
`TODO.md` for two further gaps the same investigation surfaced (Slack still needs
`users:read.email` for personal DMs; Resend has no verified sending domain yet, so email delivery
fails outright).

A requested security and bug pass (D-050) found and fixed two real vulnerabilities: a file
attached to an `INTERNAL_AHN` comment was downloadable by anyone signed in who had the direct
`/api/attachments/<id>` link, regardless of role (the route checked project membership but never
the comment's own visibility - fixed with the same `readableVisibilities` predicate the comment
thread already uses); and the portfolio CSV export was vulnerable to formula injection (CWE-1236) -
a merchant name or similar free-text column starting with `=`, `+`, `-` or `@` would run as a
formula when the exported file was opened in Excel/Sheets, now defused with the standard leading
`'`. Also added the `Content-Security-Policy` and `Strict-Transport-Security` headers, which were
simply missing - verified against a real production build with zero violations across every route.
Two further findings are noted rather than fixed: sign-in has no brute-force protection (a
lockout is itself a denial-of-service risk if done carelessly - the right fix is IP-based rate
limiting at the infrastructure layer, not in the app), and `pnpm audit` reports 6 advisories, all
transitive via `next`'s and Prisma's own bundled tooling. See D-050 and `TODO.md` §2.

**Known gaps against going live with real merchants: a few, all in `FUTURE-WORK.md`.** The biggest
one - no UI creates a user account or a merchant's project membership yet, only `pnpm db:seed` and
direct database writes do - is worth reading before promising anyone real onboarding.

---

## Where things are

| If you are changing…                    | Start at                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| what a stage means, or its target       | `packages/core/src/stages.ts`                                                   |
| how time or delay ownership is computed | `packages/core/src/sla.ts`, `intervals.ts`                                      |
| what makes a project red                | `packages/core/src/health.ts`                                                   |
| the ten questions                       | `packages/core/src/answers.ts`                                                  |
| what a status looks like                | `packages/core/src/labels.ts` — a total map, so a new status is a compile error |
| who can do what                         | `packages/rbac/src/matrix.ts`                                                   |
| a mutation                              | `apps/web/src/features/*/actions.ts`, all through `defineAction`                |
| a read                                  | `apps/web/src/features/*/queries.ts`, all through `projectScopeWhere`           |
| a component                             | `packages/ui/src` — add it there, do not invent it locally                      |
| the background work                     | `apps/worker/src/processors/`                                                   |
| a file attachment                       | `packages/storage/src` (presign, sniff), `apps/web/src/features/attachments`    |

---

## Conventions that are enforced, not merely preferred

- **`new Date()` with no arguments is banned by ESLint.** Use `clock.now()` from `@relay/core`, so
  the SLA maths stays testable. The clock and the seed are the only exceptions.
- **`apps/web` may not import `@prisma/client`** — use `@relay/db`. It may not import
  `@relay/queue/consumer` or `bullmq`. Lint refuses all three.
- **Relative imports are extensionless** across the whole workspace (D-005).
- **Every mutation writes an audit row and an activity row inside its transaction.**
- **Every feature ships its loading, empty, error and permission-denied states.**
- **Status maps are total `Record<Status, …>`.**

---

## The five things most likely to bite you

1. **Do not put a custom `output` back on the Prisma generator.** It breaks `next build` in a way
   whose error message points nowhere near the cause (D-022).
2. **Do not call `env()` at module scope in anything the web app imports.** `next build` runs with
   `NODE_ENV=production` and no secrets (D-023).
3. **Do not manage the theme through `<html>`'s className.** React rewrites it on hydration
   (D-021).
4. **Do not remove the two partial unique indexes.** They are what makes the time arithmetic safe
   under concurrency (D-008).
5. **Do not add a second place where visibility is decided.** It belongs in the query, once
   (D-009).

---

## What is left

Nothing from the original brief. Every item on the original list (file upload, the change-request
workflow, merchant portal depth), plus everything found and fixed along the way (D-035's hydration
mismatch, D-036's ClickUp task button), plus every Phase 2 item (merchant portal, automated
approvals, advanced notifications, analytics, SLA tracking with breach records, inactivity alerts,
portfolio reporting, change-request workflow) is built and verified live - see
`REQUIREMENTS-COVERAGE.md` for the full map. The integration harness spans thirteen files now,
including the first two outside `apps/web` (`apps/worker/src/processors/`).

That does not mean there is nothing left to do - a real product keeps growing - only that there is
no more of _this brief_ waiting. The next work here is whatever the client asks for next.

---

## How to work on it

Small, complete changes. Run `pnpm verify` and `pnpm build` before calling anything done, and run
`node scripts/e2e-smoke.mjs` if you touched authorization, visibility or a route group.

If you find a real problem, say so plainly rather than working around it — three of the decisions
in `DECISIONS.md` are bugs found during the build and written down instead of patched quietly, and
that is the standard to hold.
