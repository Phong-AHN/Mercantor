# Mercantor — Going-live decisions needed from you

Built autonomously per your instruction not to stop and ask. Everything below is something only
you can actually resolve — a credential, a business call, a legal judgment, money. Nothing here
blocks the code from working against seeded data; every item blocks giving a real merchant a real
login.

---

## 1. Infrastructure — none of this can be provisioned by an assistant

- [ ] **Production Postgres, Redis, and an S3-compatible bucket.** `TODO.md` §1 already lists
      this. The `.env` currently checked has a Redis Cloud URL that returns `WRONGPASS` (D-046) —
      that credential needs fixing or replacing regardless of anything else here.
- [ ] **A real hosting choice for `apps/web` and `apps/worker`.** They are not interchangeable —
      `apps/worker` needs a long-lived container, not a serverless one. `RUNBOOK.md` → Deploying
      has the detail; `infra/Dockerfile.worker` is ready.
- [ ] **A domain, DNS, and `APP_URL` pointed at it.** Every outbound link (invite emails, password
      reset links, Slack messages) is built from this value.
- [ ] **A verified Resend sending domain.** Flagged already in `TODO.md` §3 — the account
      currently configured has zero verified domains, so invite and reset emails will fail
      exactly like every other outbound email does right now.
- [ ] **TLS in front of the production deploy.** The session cookie's `secure` flag and the new
      `Strict-Transport-Security` header (D-050) both assume this; the app does not enforce it
      itself.

## 2. Business and legal calls

- [ ] **Terms of Service and a Privacy Policy.** Neither exists. A customer-facing sign-up/invite
      flow collecting a real merchant's name, email and company data needs both before real
      merchants are invited — this is legal content, not something to draft into the product
      without your (or counsel's) review. No placeholder link was added to the invite email or the
      sign-in page for this reason: a fake or unreviewed ToS link is worse than none.
- [ ] **Who gets the first real invites, and in what order.** The invite UI (built) can create any
      number of AHN/SHOPLINE staff and merchant accounts the moment someone with `user:manage`
      uses it — worth deciding the actual rollout list rather than inviting everyone in the seed
      data's shape on day one.
- [ ] **Whether merchant invitation should fold into "Send introduction."** `requirement.txt`
      describes one automated introduction email; this plan built merchant _account_ provisioning
      as its own separate "Invite merchant" action rather than extending the introduction email to
      also carry portal credentials, because the introduction email today is a fixed, previously
      reviewed template and folding a credential/invite flow into it is a content and security
      decision (should the invite link be in the same email as the intro, or separate; should it
      wait for the merchant to reply first) worth making deliberately, not as a side effect of
      this pass.
- [ ] **Sign-in rate-limit thresholds.** The delay curve shipped (see D-051) is a reasonable
      default, not a number anyone signed off on — the constants are at the top of
      `packages/auth/src/rate-limit.ts` (not an env var yet), worth revisiting if a real attacker
      or a real support complaint says the curve is wrong.

## 3. Multi-tenancy (D-052) — a scoping call made without stopping to ask, worth reviewing

- [ ] **The `AHN`/`SHOPLINE` role vocabulary was not renamed.** D-052 made the _agency_ side a
      real `Organization` any company can sign up as — its own people, its own projects, its own
      encrypted Slack/ClickUp/Resend credentials, invisible to every other tenant. What it did
      **not** do is rename `AHN_ADMIN`, `AHN_PROJECT_MANAGER`, the `AHN_SHOPLINE` comment
      visibility, or any of the copy that still says "AHN" and "SHOPLINE" by name — a second
      agency signing up today would see role labels and comment-visibility names that mean nothing
      to them. Renaming that vocabulary to something tenant-neutral ("your organization" / "your
      migration partner") is a real product decision — what the roles should be called, whether
      the SHOPLINE-side roles even make sense for a company not migrating merchants onto SHOPLINE
      — not a schema change, and was judged out of scope for this pass. Fine to keep running
      single-tenant (AHN only) indefinitely without ever touching this; it only matters the day a
      second company is actually meant to sign up and use the product under its own name.
- [ ] **Nothing yet lets a `PLATFORM_ADMIN` actually create a second organization.** The data
      model and every isolation boundary are in place and tested (see D-052), but there is no
      "Add organization" UI or action yet — today a new tenant can only be created by a direct
      database write (the same gap `FUTURE-WORK.md` §1 named for staff/merchant accounts before
      D-051 built invite flows for those). Worth building before actually onboarding a second
      company, not before that.
- [ ] **`CREDENTIAL_ENCRYPTION_KEY` rotation has no procedure yet.** Losing or rotating this key
      makes every organization's stored Slack/ClickUp/Resend credentials silently fail closed to
      the mock adapter (by design — `packages/integrations/src/registry.ts` never throws on a bad
      decrypt) rather than error loudly. Fine for now; worth a documented rotation runbook before
      there are real customers' real tokens sitting encrypted in production.
- [ ] **The aging-band thresholds and inactivity-days setting are one shared, platform-wide row,
      not per organization (found during D-054's permissions audit, deliberately not fixed there).**
      `PortalSetting` has no `organizationId` at all — any organization's `settings:manage` holder
      retuning "what counts as delayed" changes what every other organization's dashboard calls
      delayed too, and what the worker's nightly SLA sweep chases for them. The real fix
      (namespace `PortalSetting`'s key by organization, or add a column, then teach
      `apps/worker/src/processors/maintenance.ts`'s sweep to load a threshold set per project's own
      organization instead of one global value) touches the worker's live SLA/health computation
      directly — D-041's own load-bearing logic — and was judged too large a change to make
      correctly inside an already-broad audit pass rather than as its own dedicated one. Separately
      worth knowing: the Settings form's thresholds are _already_ disconnected from most live
      rendering today — `buildSnapshot`'s two page-render call sites never pass them and always use
      the hardcoded defaults; only the worker's periodic sweep reads the configured value at all.
      That disconnect predates this pass and is unrelated to multi-tenancy, but narrows how much
      the shared-row problem actually bites in practice today.

## 4. Product decisions already open before this pass

Carried forward, unchanged, from `TODO.md` §5 (O1–O3) — still nobody's real call but AHN/SHOPLINE's
own: whether an AHN PM can record a merchant's approval on their behalf, whether a SHOPLINE
solutions engineer sees money, and how much blocker detail a merchant portal shows. See `RBAC.md`
§5.

---

Nothing in this file is a reason not to keep using the product against seeded data today. It is
the checklist for the day a real merchant's email address is about to be typed into "Invite
merchant" for the first time.
