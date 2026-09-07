# Mercantor — Database

PostgreSQL 17 + Prisma 6. Schema at `packages/db/prisma/schema.prisma`; migrations at
`packages/db/prisma/migrations`.

---

## Conventions

- **UUIDv7 primary keys** (`@default(uuid(7))`), so ids sort by creation time.
- **`Timestamptz(3)` everywhere, all values UTC.** The UI renders UTC too, so two people reading
  the same screen in two countries see the same string.
- **Money as integer minor units.** `amountMinor`, `paidMinor`, `contractTotalMinor`. A float is
  wrong by a cent eventually, and this is the number people argue about.
- **Soft delete via `deletedAt`** where a record must survive being removed.
- **Migrations are SQL files.** Write them without a BOM — PowerShell's `Out-File` adds one and
  Postgres fails with `syntax error at or near "﻿"`. Bitten twice on the previous project.

---

## The shape

```
Merchant ──< MerchantContact
   │
   └──< Project ──┬──< StageEvent            one open row = the current stage
                  ├──< Blocker ──< BlockerOwnership   one open span = the current owner
                  ├──< ScopeItem / AccessItem / AssetItem
                  │      ScopeItem >── Invoice   an approved change request's line (D-031)
                  ├──< Comment ──< CommentMention
                  ├──< ActivityEvent           the system-written history
                  ├──< Issue
                  ├──< Invoice                 milestone billing
                  ├──< Approval                one row per checkpoint type
                  ├──< HandoffSubmission       with a checklist snapshot
                  ├──< IntroductionEmail       with the body exactly as sent
                  ├──< IntegrationLink         Slack channel, ClickUp task
                  ├──< OutboxMessage           written in the same transaction as the change
                  ├──< Attachment
                  ├──< Notification
                  ├──< AuditLog
                  └──< ProjectMember           the merchant access boundary

User ──< Session                sessions stored hashed, never in plaintext
PortalSetting                   ageing thresholds, inactivity limit
SavedView                       named filter sets
```

---

## Two tables carry the time model

Everything the SLA screens show is computed from these, not stored as a number somebody has to
remember to update.

**`StageEvent`** — one row per visit to a stage. `exitedAt IS NULL` means the project is there
now. Repeat visits are separate rows, which is how re-work stays visible instead of averaging
away.

**`BlockerOwnership`** — one row per ownership span of one blocker. Reassigning closes the open
span and opens the next at the same instant, so the previous owner's timer stops exactly as the
new one's starts.

Both are protected by partial unique indexes:

```sql
CREATE UNIQUE INDEX "StageEvent_one_open_per_project"
  ON "StageEvent" ("projectId") WHERE "exitedAt" IS NULL;

CREATE UNIQUE INDEX "BlockerOwnership_one_open_per_blocker"
  ON "BlockerOwnership" ("blockerId") WHERE "endedAt" IS NULL;
```

Without those, a concurrent write could leave two open spans and the arithmetic would
double-count. With them, the database refuses.

---

## Constraints that are load-bearing

These are not decoration. Each one encodes a rule the application also enforces, so a bug in the
application surfaces as a failed write rather than as bad data.

| Constraint                                    | What it prevents                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `Blocker_resolution_requires_timestamp`       | A blocker resolved with no explanation, or an explanation with no resolution |
| `Blocker_resolved_after_started`              | Negative blocker durations                                                   |
| `BlockerOwnership_ended_after_started`        | Negative ownership spans                                                     |
| `StageEvent_exited_after_entered`             | Negative stage dwell                                                         |
| `StageEvent_closed_requires_duration`         | A closed visit whose cached duration was never written                       |
| `Invoice_amounts_non_negative`                | Negative money                                                               |
| `Invoice_paid_within_amount`                  | Being paid more than was invoiced                                            |
| `Invoice_paid_requires_full_amount`           | A "paid" invoice that is not actually settled                                |
| `Invoice_sent_requires_number`                | A sent invoice with no number or date                                        |
| `Project_completed_requires_timestamp`        | A completed project with no completion date                                  |
| `Project_target_after_start`                  | A launch target before the project began                                     |
| `Approval_decision_requires_decider`          | A decision with nobody's name on it                                          |
| `Issue_resolved_requires_resolution`          | A closed issue with no resolution                                            |
| `IntroductionEmail_sent_requires_timestamp`   | A sent email with no sent date                                               |
| `HandoffSubmission_decision_requires_decider` | A handoff decision with nobody's name on it                                  |
| `Attachment_file_requires_storage_key`        | A file attachment with no bytes behind it                                    |
| `Session_expires_after_creation`              | A session that expires before it exists                                      |

---

## Denormalisation, and why

Two columns are caches, and both are recomputed inside the transaction that could invalidate
them, plus every fifteen minutes by the worker:

- **`Project.health`** — so the portfolio list can sort and filter on it without loading every
  project's full history. The truth is `assessHealth`; this is a materialisation of it.
- **`Project.currentBlockerId`** — the oldest unresolved blocker, so the list and the banner do
  not each go looking.

`Project.lastActivityAt` is not a cache: it is written by every mutation a human would call
activity, and it is what the inactivity alert reads.

---

## Reading safely

Every read goes through `features/*/queries.ts`, and every one of them starts from
`projectScopeWhere(principal)`. A merchant asking for a project id that is not theirs gets no
rows — the restriction is in the `where`, not applied afterwards.

Comment and activity visibility works the same way: `readableVisibilities(principal)` goes into
the query, so a note somebody cannot read is never fetched.
