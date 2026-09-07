# Mercantor — Future work

Everything in `requirement.txt` is built (`REQUIREMENTS-COVERAGE.md`). This is not a gap list
against that brief — it is the honest list of things a _real, ongoing_ deployment will eventually
need that were deliberately not built opportunistically, either because they need more product
scope than "add a button" or because the fix carries its own migration risk. Nothing here blocks
using the portal as specified; each item is here so it is decided on purpose, later, rather than
discovered by surprise.

---

## 1. Account and project provisioning has no UI yet

The whole app assumes a `User` row and, for a merchant, a `ProjectMember` row already exist —
nothing wrong with that model, but nothing in the UI can create either one:

- **No user management screen.** `/people` (`apps/web/src/app/(app)/people/page.tsx`) is read-only
  — a directory, not an admin tool. The RBAC matrix already grants `user:manage` to `AHN_ADMIN` and
  `SHOPLINE_ADMIN` (`packages/rbac/src/matrix.ts`), but no action anywhere checks it yet - it is a
  permission reserved for a feature that was never built. Today, every account (staff or merchant)
  exists only because `pnpm db:seed` created it or someone wrote directly to the database.
- **No merchant invite flow.** A merchant's access to `/portal` is a `ProjectMember` row
  (D-010) — real, enforced, and correct once it exists — but nothing creates one. It is worth
  designing deliberately (a real invite email, an expiring link, doubling as the "automated merchant
  introduction" flow the brief already asks for) rather than added as an afterthought.
- **No password reset.** No forgot-password request, no reset email, no expiring token. A locked-out
  user needs their `passwordHash` updated directly today.

These three are really one theme — administrative write actions for rows that today are seed-only —
and are probably worth designing and building together rather than one at a time. Connecting a
project to a Slack channel or a ClickUp task no longer belongs on this list: each project's own
Settings page now has a connect/disconnect form for both, verified live before saving (D-045).

## 2. Architectural cleanup flagged during the D-043 review

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

## 3. Dependency upgrades noticed, not taken

Each carries its own migration risk and was deliberately left for a dedicated pass rather than
folded into an unrelated change:

- **Prisma 6.19.3 → 8.0.0-rc.12.** `pnpm db:migrate:deploy` already prints the update notice. A
  major version, and the target is still a release candidate — wait for a stable release and budget
  a real migration pass (config file format, generated client shape, and this project's own
  Windows-file-lock workaround in `RUNBOOK.md` should all be re-checked against it).
- **Next.js's own ESLint plugin isn't wired up.** `next build` prints "The Next.js plugin was not
  detected in your ESLint configuration" on every build. Cosmetic today — nothing fails — but worth
  fixing the next time `eslint.config.mjs` is touched for an unrelated reason.

## 4. Product decisions intentionally left open

`RBAC.md` §5 (O1, O2, O3) and `docs/TODO.md` §4 - these are answered with a reasoned default today,
not blocked on anything technical. Revisit them if the real AHN/SHOPLINE team's process disagrees
with the default.
