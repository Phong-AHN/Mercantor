# Mercantor — Going customer-facing

Requested directly: turn this from an internal AHN demo (seeded users, mock-first integrations)
into something real merchants and SHOPLINE staff can actually be given a login to. This is the
plan that was executed against, in order. `GOING-LIVE-DECISIONS.md` carries everything found along
the way that needs a human's call rather than code — read that file before actually inviting a
real merchant.

---

## What "customer-facing" was actually missing

Everything in `requirement.txt` was already built and verified (`REQUIREMENTS-COVERAGE.md`). What
was missing was never a product feature — it was the plumbing around _getting a real person into
the product at all_, which `FUTURE-WORK.md` §1 had been flagging since Phase 2 closed:

1. No UI created a `User` row. Every account that exists today exists because `pnpm db:seed`
   created it.
2. No UI created a merchant's `ProjectMember` row — the only thing that actually grants portal
   access.
3. No password reset. A locked-out user needed a database write.
4. No rate limiting on sign-in beyond scrypt's own cost (D-050 flagged this and deliberately did
   not patch it blind).
5. Nothing distinguishes a real production `.env` from a demo one at the UI layer — the sign-in
   page's demo-account picker and the "development-only" wording needed to actually gate on
   environment, not just claim to.

None of the five are infrastructure or a business decision — every one is code, and every one is
now built.

## What was built, in the order it was built

1. **Password reset** — self-service, token-based, the same hashed-token pattern `Session` already
   uses. `/forgot-password` requests one (always the same response, whether or not the email
   exists — same anti-enumeration shape `signIn()` already uses); `/reset-password?token=...`
   consumes it once and revokes every existing session for that account.
2. **Staff provisioning** — `/people` gained an "Invite person" form for anyone holding
   `user:manage` (`AHN_ADMIN`, `SHOPLINE_ADMIN` today). Creates the `User` row and sends a
   set-password email through the same token mechanism as the reset flow (`purpose: INVITE`
   instead of `RESET` — one token table, one consumption path, two ways in).
3. **Merchant provisioning** — each project's Settings page gained an "Invite merchant" form.
   Creates the `User` (role `MERCHANT`) and the `ProjectMember` row in one transaction, and sends
   the same invite email. This is the one `FUTURE-WORK.md` explicitly called out as worth
   designing together with the automated-introduction flow rather than bolting on — it is
   deliberately a plain, separate invite here, not merged into `Send introduction` yet; see the
   decisions file for why.
4. **Sign-in rate limiting** — a per-email exponential delay backed by the database (not a hard
   lockout, which is its own denial-of-service vector — see D-050's reasoning, carried forward
   here rather than re-litigated). Fails open: if the check itself cannot run, sign-in proceeds
   rather than locking everyone out.
5. **Environment-gated demo surface** — the sign-in page's account picker and its "development
   only" label now actually check `NODE_ENV`/`APP_ENV` rather than asserting it in prose a real
   deploy could still render.

## What this plan explicitly does not attempt

Provisioning real infrastructure, buying a domain, creating third-party accounts (Resend, a
production Postgres/Redis, an S3 bucket), and anything requiring a business or legal judgment call
(pricing, terms of service, a privacy policy, which real humans get the first invites) are not
things code can do. Every one of those is listed, with what is needed to close it, in
`GOING-LIVE-DECISIONS.md`.
