# Mercantor — Future work

Everything in `requirement.txt` is built (`REQUIREMENTS-COVERAGE.md`). This is not a gap list
against that brief — it is the honest list of things a _real, ongoing_ deployment will eventually
need that were deliberately not built opportunistically, either because they need more product
scope than "add a button" or because the fix carries its own migration risk. Nothing here blocks
using the portal as specified; each item is here so it is decided on purpose, later, rather than
discovered by surprise.

---

## 1. Account and project provisioning — closed by D-051

This whole section used to describe three gaps: no way to create a `User` row, no way to grant a
merchant a `ProjectMember` row, no password reset. All three are built now (D-051) - `/people`'s
"Invite person" form, each project's Settings page's "Invite to portal" form, and
`/forgot-password` + `/set-password`. What is left in this area is smaller and named in
`GOING-LIVE-DECISIONS.md` instead, since none of it is a technical gap: who the first real invites
should go to, whether merchant provisioning should eventually fold into `sendIntroductionAction`
rather than staying its own separate action, and the sign-in rate-limit constants being a
reasonable default rather than a number anyone has stress-tested.

Connecting a project to a Slack channel or a ClickUp task doesn't belong on this list either: each
project's own Settings page has had a connect/disconnect form for both since D-045.

## 2. Multi-tenancy — closed by D-052, two real gaps left

`Organization` is now the top-level tenant, self-service encrypted integration credentials
included - see D-052 in `DECISIONS.md`. Two things are named there rather than built, since
neither is a technical gap in the sense the rest of this file means:

- **No UI yet for a `PLATFORM_ADMIN` to create a second organization.** Today that is a direct
  database write, the same shape `User`/`ProjectMember` provisioning was in before D-051 built
  invite flows for those. Worth building the day a second company is actually meant to sign up,
  not before.
- **The `AHN`/`SHOPLINE` role and comment-visibility vocabulary was not renamed to something
  tenant-neutral.** A real product decision - what the roles should even be called for a company
  not migrating merchants onto SHOPLINE - not a schema change, and listed in
  `GOING-LIVE-DECISIONS.md` §3 rather than decided here.

## 3. Architectural cleanup flagged during the D-043 review

`apps/worker/src/processors/maintenance.ts`'s `slaSweep` duplicates a focused piece of
`apps/web/src/server/record.ts`'s `queueUrgentNotificationDeliveries` (email + Slack DM queuing for
an urgent notification) rather than importing it, because `apps/worker` cannot reach into
`apps/web`'s server helpers — the same app-to-app boundary D-037 already ran into for its test
fixtures. The duplication is small, deliberate, and cross-referenced in both files' comments, but
if `record.ts`'s functions (`audit`, `recordActivity`, `queueOutbox`, `notify`,
`queueUrgentNotificationDeliveries`) ever need a third caller, or drift from each other, they are a
good candidate for extraction into a shared package both apps already depend on (`@relay/core`
cannot host them without a circular dependency on `@relay/rbac`; a new small package, or moving them
into `@relay/db`, would need to be the target). Twelve files inside `apps/web` import from
`@/server/record` today, so this is a real refactor, not a rename.

## 4. Dependency upgrades noticed, not taken

Each carries its own migration risk and was deliberately left for a dedicated pass rather than
folded into an unrelated change:

- **Prisma 6.19.3 → 8.0.0-rc.12.** `pnpm db:migrate:deploy` already prints the update notice. A
  major version, and the target is still a release candidate — wait for a stable release and budget
  a real migration pass (config file format, generated client shape, and this project's own
  Windows-file-lock workaround in `RUNBOOK.md` should all be re-checked against it).
- **Next.js's own ESLint plugin isn't wired up.** `next build` prints "The Next.js plugin was not
  detected in your ESLint configuration" on every build. Cosmetic today — nothing fails — but worth
  fixing the next time `eslint.config.mjs` is touched for an unrelated reason.

## 5. Product decisions intentionally left open

`RBAC.md` §5 (O1, O2, O3) and `docs/TODO.md` §4 - these are answered with a reasoned default today,
not blocked on anything technical. Revisit them if the real AHN/SHOPLINE team's process disagrees
with the default.
