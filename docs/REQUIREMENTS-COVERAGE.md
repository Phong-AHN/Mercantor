# Requirement coverage

Every section of `requirement.txt`, mapped to where it lives and what state it is in.

**Legend** — ✅ built · 🟡 partial, with the gap named · ⬜ Phase 2, not started

---

## Project dashboard

| Required field                          | Where                                                            | State |
| --------------------------------------- | ---------------------------------------------------------------- | ----- |
| Merchant / company name                 | `Merchant.name`                                                  | ✅    |
| Merchant website                        | `Merchant.website`                                               | ✅    |
| Merchant contact name/email/phone       | `MerchantContact` (many per merchant, one primary)               | ✅    |
| SHOPLINE account / store ID             | `Merchant.shoplineStoreId`                                       | ✅    |
| Current ecommerce platform              | `Merchant.currentPlatform`                                       | ✅    |
| AHN project manager                     | `Project.ahnProjectManagerId`                                    | ✅    |
| AHN developer                           | `Project.ahnDeveloperId`                                         | ✅    |
| SHOPLINE account manager                | `Project.shoplineAmId`                                           | ✅    |
| SHOPLINE solutions engineer             | `Project.shoplineSeId`                                           | ✅    |
| Project start date                      | `Project.startDate`                                              | ✅    |
| Target launch date                      | `Project.targetLaunchDate`                                       | ✅    |
| Migration type                          | `Project.migrationType`                                          | ✅    |
| Project status                          | `Project.stage` + derived `health`                               | ✅    |
| Last activity date                      | `Project.lastActivityAt`, written by every mutation              | ✅    |
| Current blocker                         | `Project.currentBlockerId` → `Blocker`                           | ✅    |
| Person/team responsible for next action | `Project.nextAction`, `nextActionOwnerId`, `nextActionOwnerTeam` | ✅    |

**Screens** — `/dashboard` (portfolio), `/projects` (table + board), `/projects/[code]` (the
record). Filters live in the URL, so a filtered view is a link.

## Automated merchant introduction ✅

`features/introduction/actions.ts`, rendered by `packages/core/src/intro-email.ts`.

The **Send introduction** button is in the project header. The body is generated from the record:
merchant name and contact, AHN contact, SHOPLINE contact, migration type, target launch, next
steps, the blocking access items, and a link to the project. Sending records an
`IntroductionEmail` row with the exact body sent, moves the project to Merchant Contacted, starts
the response clock, and notifies both sides. Response and bounce are recorded on the project's
Settings tab; the SLA sweep nags after three days of silence.

Delivery goes through `EmailProvider` — Resend when `RESEND_API_KEY` is set, the mock otherwise.

## Migration type / scope ✅

`ScopeItem`, seeded from `DEFAULT_SCOPE_TEMPLATE` per migration type. Products, variants, images,
collections, customers, orders, pages, navigation, policies, theme/design, redirects, apps — each
with source and migrated counts and a status.

`disposition` is `IN_SCOPE` / `OUT_OF_SCOPE` / `CHANGE_REQUEST`, so anything outside the agreed
scope is flagged rather than absorbed. Raising a change request posts to Slack, because it is a
commercial event. Screen: the project's **Scope** tab.

**Pricing, approval and the invoice line are built.** Pricing an item is part of the same edit
that flags it as a change request. Approval is a separate, narrower step - `invoice:manage`, not
`scope:manage` (D-031) - that creates a linked `Invoice` row in the same transaction, tagged
"change request" on the **Invoices** tab. An unpriced or already-approved change request cannot
be approved again.

## Project stages ✅

All eighteen, in `packages/core/src/stages.ts`, each with its owning team and target duration.
Shown as a stage rail on the project overview and as a phase board on `/projects?view=board`.

## Access & credentials checklist ✅

`AccessItem`, seeded from `DEFAULT_ACCESS_CHECKLIST`: SHOPLINE, source platform, domain/DNS, apps,
product/order/customer data, brand assets, payment, email, analytics. Statuses are
Not Requested → Requested → Received → Verified → Issue.

Items marked `blocking` are what "blocked waiting for merchant access" means: they gate the
handoff check, drive the dashboard warning, and are listed in the introduction email. A merchant
can mark an item provided or broken; **only AHN can mark it verified** — received is not the same
as working.

## Required merchant assets ✅

`AssetItem`, seeded from `DEFAULT_ASSET_CHECKLIST`: logo, brand guidelines, fonts, colours,
product images and data, sitemap, URL structure, approved redirect map, policies, shipping, tax,
payment, legal, credentials. Links or files attach to the item they belong to.

**File upload** (`@relay/storage`, `apps/web/src/features/attachments`): a presigned POST to
MinIO/S3, never through the app server — the client asks for a signature, uploads straight to the
bucket, then the server reads the real bytes back and sniffs them by magic number before an
`Attachment` row (and the link everyone sees) is created. A type or size mismatch between what was
declared and what actually landed deletes the object and nothing is attached (D-028, D-029). Wired
into the access, asset and issue checklists, and into comments (D-033), on both the AHN and
merchant-portal sides.

## Project comments / activity feed ✅

`Comment` with category (general update, merchant request, AHN/SHOPLINE question, technical,
design, migration, QA, deployment, scope change), `@mentions`, attachments, status and assignee.
`ActivityEvent` is the system-written half — stage changes, blockers, approvals, decisions.

**Threading**: `Comment.parentId`, with a reply rendered nested under its parent and itself
repliable. The write path (`postCommentAction`) already validated a parent belongs to the same
project; what shipped here is the read side and the UI (D-032). Verified in
`scripts/thread-smoke.mjs`.

**Visibility** is the private-notes mechanism: `INTERNAL_AHN` / `AHN_SHOPLINE` / `EVERYONE`,
applied in the query's `where`, so a note you cannot read is never sent to your browser. Verified
in `scripts/e2e-smoke.mjs` from all three directions.

## Slack integration ✅

`IntegrationLink` per project. Stage changes, blockers, approvals, change requests, handoffs and
any update posted with "also post to Slack" go to the linked channel with a link back to the
record. An AHN-internal note is never sent, whatever the checkbox says.

**Slack → portal** works too: paste a message permalink and it is pulled into the project history
with its provenance. Live when `SLACK_BOT_TOKEN` is set; the mock records what it would send.

## ClickUp integration ✅

`IntegrationLink` per project, `DEFAULT_CLICKUP_STATUS_MAP` translating portal stage → ClickUp
status. Stage changes push a status; comments can push a comment. One direction only: ClickUp
stays AHN's execution layer, the portal stays the shared source of truth.

**Creating a ClickUp task from an issue** is wired: "Create ClickUp task" on an open issue creates
it as a subtask of the project's already-linked task, deriving the list from that task rather than
needing a separate list setting (D-036). The button becomes a "View in ClickUp" link once created.

## Blocker management ✅

`Blocker` with all twelve categories, an owner (team and optionally a person), next action, due
date, and its own start timestamp. `BlockerOwnership` records each ownership span: reassigning
stops the previous owner's timer at the same instant the next one's starts, guaranteed by a
partial unique index. Screens: project **Blockers** tab and the portfolio-wide `/blockers`.

## Issues / escalations ✅

`Issue` with a per-project reference (`ISS-3`), title, description, attachments, severity
(Low / Medium / High / Launch Blocker), owner, reported date, status, resolution and resolved
date. A launch blocker turns its project red on its own. Screens: project **Issues** tab and
`/issues`.

## Invoice tracking ✅

`Invoice` per milestone, so milestone billing is the normal case rather than a special one. Total,
invoiced, number, date, due date, paid, outstanding, and status
(Not Invoiced / Invoice Sent / Partially Paid / Paid / Overdue). The project rollup is derived
from the rows, never typed in. The nightly sweep marks invoices overdue and nags once. Money is
invisible to roles that have no business seeing it — see [`RBAC.md`](RBAC.md).

## Approvals ✅

`Approval`, one row per type per project: Design, Development, QA, Merchant Final, SHOPLINE
Deployment. Each records who requested it, who decided it and when. A checkpoint can only be
decided by the side that owns it — `canDecideApproval` refuses the rest, server-side.

The merchant portal's **Approvals** tab shows all five as one ordered pipeline — previously it
excluded SHOPLINE Deployment along with the merchant's own checkpoint, so a merchant could approve
the store but never see whether it had actually gone live afterwards (D-034).

**Requests are automatic; decisions never are.** Moving into the stage where a checkpoint becomes
due auto-requests it — Merchant Design Review → Design, Internal QA → Development, Migration
Validation → QA and Merchant Final together — the same way submitting the handoff package already
auto-requested SHOPLINE Deployment. Nobody has to remember to click "Request"; the decision itself
still always takes a person (D-038).

## SHOPLINE handoff / deployment ✅

**Submit to SHOPLINE** is in the project header. Before anything is sent, the server verifies
migration, design approval, development, QA, merchant approval, open blockers, launch-blocking
issues, blocking access and required assets; the same computation is shown as a live checklist on
the **SHOPLINE handoff** tab, so a blocked button is explained rather than mysterious. The
submission stores a snapshot of the checklist as it stood.

SHOPLINE answers with **Approve deployment**, **Request changes** or **Report an issue**.
Approval moves the project to Ready for Deployment; the other two send it back to Development
with the notes attached.

## Notifications ✅

In-app, with a bell and unread counts. Written inline for direct events (mention, assignment,
blocker handover, approval request, handoff decision) and by the nightly `sla-sweep` for the
chasing ones: unanswered introductions, missing access, missing assets, inactivity, pending
approvals, launch blockers, overdue invoices and stage overruns. Each nag is deduplicated per
person per day, so a stuck project is mentioned once a day rather than once a sweep.

Four types urgent enough to also reach someone away from the portal go out as email **and** a
direct Slack message through the same outbox Slack and ClickUp already use: a launch blocker, a
pending approval, a project ready for SHOPLINE review, and a deployment decision (D-027, D-039).
`notify()` in `apps/web/src/server/record.ts` is the one place that decides this - every call site
stays unaware, exactly like the Slack fan-out. The Slack DM needs no setup: the recipient's Slack
account is found by their work email at delivery time, and someone with no matching account is
skipped, not treated as a failure.

## Communication history ✅

The project **Timeline** tab: every recorded event, newest first, grouped by day — introduction,
merchant response, kickoff, access, assets, design, feedback, development, QA, SHOPLINE review,
deployment. Written by the portal as things happen, not typed in afterwards, and not editable.

## SHOPLINE portfolio dashboard ✅

`/dashboard`: total and active projects, projects by stage grouped by phase, health split, ageing
bands, average project duration, average AHN / merchant / SHOPLINE time per project, longest
active project, projects over target, projects on schedule, active blockers by owner, launches
this month and in the next three weeks, outstanding and overdue money.

## Search & filters ✅

`/projects` filters by merchant, code or store ID, stage, health, migration type, AHN PM, AHN
developer, SHOPLINE AM, blocker owner, launch window, and completed-or-not, with six sort orders.
All of it in the URL. `/` focuses the global search from anywhere.

## Portfolio export ✅

"Export CSV" on `/projects` downloads the table exactly as filtered - the route reuses the same
`parseFilters` + `listProjects` the page itself calls, so the file can never disagree with the
screen it was exported from. Money columns follow the same `invoice:read` gate the table's own
`showMoney` flag uses, and a merchant is scoped to their own project the same way every other read
is (D-040).

## Roles & permissions ✅

Eight roles, one grant matrix, one policy engine — [`RBAC.md`](RBAC.md). SHOPLINE sees status,
timeline, issues, blockers, communications and deployment readiness. AHN sees delivery. The
merchant gets a separate surface for assets, access, design review, feedback and approvals.
Internal AHN notes stay inside AHN, enforced in the query.

---

## MVP phase 1 — complete

Project dashboard, contact database, automated introduction, migration scope, project stages,
access and asset checklists, activity feed, blockers, issue tracking, Slack integration, ClickUp
integration, invoice tracking and SHOPLINE handoff are all built and demonstrable against seeded
data.

## Project time tracking & SLA ✅

The part with the most care in it, and the most tests.

- Project age, start date, target launch, current stage, current stage duration and days
  ahead/behind are on the project header and the **Time & SLA** tab.
- Time is tracked per stage across repeat visits, so re-work is visible rather than hidden.
- Delay ownership is tracked separately from stage time: AHN execution, merchant waiting,
  SHOPLINE waiting, and unassigned.
- Every blocker has its own timer showing when it started and how long it has been open, and
  handing it over stops one timer as it starts the next.
- Dashboard metrics: average total duration, average time per team, longest active project,
  projects over target, projects on schedule.
- Ageing bands (0–30 On Track, 31–45 Attention, 46–60 Delayed, 60+ Critical) are configurable at
  `/settings` and read by both the app and the worker.
- Formal breach records: a `SlaBreach` row opens the moment a stage or the target launch date runs
  over target - whether a mutation causes it or the 15-minute sweep simply notices - and closes at
  the exact instant `moveStage` learns the stage was left or the project completed. Shown as a
  history table on the **Time & SLA** tab, distinct from the live "over target right now" figures
  above it (D-041).

## Analytics ✅

`/analytics`: throughput (projects started versus actually launched), cycle time (average days
from start to launch), and SLA breaches opened, each trended over the last six months rather than
shown only as a current snapshot - that is what `/dashboard` already does. No new schema: every
figure is bucketed from `Project.startDate` / `actualLaunchDate` / `completedAt` and
`SlaBreach.startedAt`, the same columns the rest of the product already writes (D-042).

## Phase 2 — complete

Every item the brief names - merchant portal, automated approvals, advanced notifications,
analytics, SLA tracking with breach records, inactivity alerts, portfolio reporting, and the
change-request workflow - is built and verified live. Nothing here is theoretical or partially
wired; each has its own decision entry above and its own smoke script in `scripts/`.

---

## Known gaps, stated plainly

None. Every requirement in `requirement.txt`, Phase 1 and Phase 2 both, is built and verified live.
A full manual review once nothing remained (D-043) found and fixed five real bugs across earlier
decisions - see D-043 for what they were and how each was verified.

## Test coverage

Three layers, each testing something the other two cannot:

- **Unit tests** (`pnpm test`, 55 tests) — the SLA maths, the state machine, RBAC, password
  hashing, the portfolio CSV's escaping and column rules (D-040), which SLA breaches should be
  open, dated to the exact crossing, purely from the time model already computed (D-041), the
  calendar-month bucketing behind the analytics trends - including a year boundary (D-042), and
  that a Slack lookup failure is only ever a permanent skip when it is genuinely non-retryable
  (D-043), with no infrastructure and no I/O.
- **Integration tests** (`pnpm test:integration`, 61 tests over 13 files) — the real exported
  server actions (and, for the first time, a real worker processor - see D-037) against a real
  Postgres, through a harness that mocks only `next/headers`, `next/cache` and `server-only` (see
  `apps/web/test/`). They prove: the blocker-handover arithmetic writes the right rows with no gap
  and no overlap; the handoff readiness gate refuses submission and names what is missing, then
  opens once every requirement is met; comment visibility is enforced by the query for all three
  teams, both reading and writing, including a reply, whose parent must be on the same project; a
  transaction that throws after a successful write leaves nothing behind - the guarantee the whole
  outbox pattern depends on; a launch blocker queues exactly one email per recipient while an
  ordinary issue queues none; the file-upload handshake, against a real MinIO bucket - a declared
  type or size the allowlist rejects, real bytes that disagree with the declared type deleted and
  never attached, and a presigned key from one project refused when confirmed against another; a
  change request can only be approved by `invoice:manage`, only once, only after it is priced, and
  only alongside exactly one new invoice line; a ClickUp task is created as a subtask of the
  project's linked task, refused when nothing is linked, refused a second time once one exists; a
  payment accumulates against the real running total rather than overwriting it, and is refused
  outright once it would exceed the invoice; the SLA sweep's per-day dedupe holds under a frozen
  clock - the same nag never repeats within a day, and a new day always earns a fresh one;
  entering the stage a checkpoint is due in requests it automatically, attributed to nobody, never
  clobbers a live or decided request, and re-requests one that was sent back for changes (D-038);
  and a launch blocker queues one Slack DM per recipient alongside the email, resolved by email at
  delivery time against a real (mock) Slack call, not a stub of the whole path (D-039); the
  portfolio export carries the same money gate and merchant scoping as the table, and honours the
  query string the same way `listProjects` does (D-040); a formal SLA breach opens dated to the
  exact crossing and never duplicates, a launch breach resolves once its target date is pushed out
  (and never earlier than it started, even against an earlier "now"), and `moveStage` closes a
  stage breach for the stage being left and a launch breach the moment the project completes,
  leaving an unrelated breach alone (D-041); analytics trends bucket started/launched projects
  and SLA breaches into the correct calendar month, average cycle time correctly per month, and
  exclude a project outside the trailing window entirely (D-042); and, from the D-043 review, a
  re-requested approval's stale rejection note is cleared, a file attached to an `INTERNAL_AHN`
  comment logs its activity at that same visibility rather than `EVERYONE`, refusing one attached
  against a comment id from another project, and the SLA sweep's approval nag queues an email and a
  Slack DM the first time and neither again the same day.
- **End-to-end** (`node scripts/e2e-smoke.mjs`, 11 checks; `node scripts/upload-smoke.mjs`, 7
  checks; `node scripts/change-request-smoke.mjs`, 8 checks; `node scripts/thread-smoke.mjs`, 6
  checks; `node scripts/clickup-task-smoke.mjs`, 4 checks;
  `node scripts/auto-approval-smoke.mjs`, 5 checks; `node scripts/portfolio-export-smoke.mjs`, 12
  checks; `node scripts/sla-breach-smoke.mjs`, 8 checks; `node scripts/analytics-smoke.mjs`, 7
  checks) — a real browser, a real sign-in, and each feature as a user would actually click
  through it.
