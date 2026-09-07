# Mercantor — TODO for you

Everything in `requirement.txt` is built and verified — see `REQUIREMENTS-COVERAGE.md`. What is
listed here is not missing code. It is account access, business decisions, and provisioning that
only a human with the right logins can do — nobody can automate a signature on a Slack app
install screen or a credit card on a hosting bill. Nothing here blocks using the portal locally
against seeded data; it only blocks going live with real merchants.

---

## 1. Before going live at all

- [ ] **Generate real production secrets.** The checked-in `.env.example` values for
      `SESSION_SIGNING_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` are dev-only placeholders. Generate
      fresh ones for production with `openssl rand -base64 32` and never reuse the dev values.
- [ ] **Provision production infrastructure** — distinct from the local `pnpm infra:up` containers:
  - A managed Postgres instance (`DATABASE_URL` / `DIRECT_URL`).
  - A managed Redis instance (`REDIS_URL`) — BullMQ needs a real, persistent one.
  - An S3 bucket (or another S3-compatible store). **It must exist before first boot** — nothing
    creates it automatically in production, unlike the local MinIO sidecar.
- [ ] **Choose hosting for both processes** (see `RUNBOOK.md` → Deploying) — they are not
      interchangeable:
  - `apps/web` — any Node host or serverless platform (Vercel, Render, Railway, etc.).
  - `apps/worker` — needs a **long-lived container**, not a serverless/request-scoped runtime, since
    it holds a blocking Redis connection. `infra/Dockerfile.worker` is ready to use. Vercel cannot
    host this half.
- [ ] **Buy/point a domain and set `APP_URL`** to the real production URL — it is used in every
      outbound link (introduction emails, Slack messages, notification emails). Getting it wrong is
      the most common cause of "the Slack link is broken" (see `RUNBOOK.md`).

## 2. Security — two things a security pass (D-050) found and could not fix from here

- [ ] **Sign-in has no brute-force protection beyond scrypt's own cost.** User-enumeration is
      already defended against correctly (a constant-time dummy-hash check, one generic error
      regardless of which part was wrong), but nothing throttles repeated attempts. Deliberately
      not patched with a quick per-account lockout - that is itself a denial-of-service vector,
      since anyone can lock a real person out of their own account just by failing their password a
      few times. The standard, safer answer is IP-based rate limiting at the infrastructure/edge
      layer (a WAF, a reverse proxy, or your hosting platform's own bot/abuse protection) rather
      than an application-level lockout - whoever picks the production host should turn this on
      there before going live with real accounts.
- [ ] **Run `pnpm update next` and `pnpm audit` again with full registry access.** From inside this
      build's sandbox, `pnpm audit --prod` reports 6 advisories (4 high, 2 moderate) - `postcss`
      and `sharp`, both bundled inside `next` itself, and `deepmerge-ts` inside Prisma's own CLI
      tooling. None are a direct dependency of this app's code, and `pnpm update next` found
      nothing newer than the already-installed `15.5.23` here, which is very likely this sandbox's
      own registry mirror lagging the public one (`15.5.25` exists in the same `^15.5.0` range) -
      worth confirming with a real update + re-audit before the next deploy, not urgent before then.

## 3. Integrations — each is optional and mocked until your organization configures it (`INTEGRATIONS.md`)

**Since D-052, this is self-service through the product, not an env var.** `SLACK_BOT_TOKEN` /
`CLICKUP_API_TOKEN` / `RESEND_API_KEY` in `.env` do nothing any more — every organization
(AHN Media's bootstrap org included) configures its own credentials at `/integrations`
(`integration:manage`, e.g. `AHN_ADMIN`), encrypted at rest and verified live before being saved.
The credential requirements below are unchanged; only where they get typed in has moved.

- [ ] **Slack, option A — set up the OAuth "Connect" button (D-053), so any organization's admin
      authorizes it with one click instead of ever handling a token.** A one-time,
      platform-level registration, not per organization: create a Slack app at
      <https://api.slack.com/apps>, add the bot scopes `chat:write`, `channels:read`,
      `groups:read`, `mpim:read`, `im:read`, `channels:history`, `users:read.email` under OAuth &
      Permissions, set its redirect URL to `<APP_URL>/api/oauth/slack/callback`, then set
      `SLACK_OAUTH_CLIENT_ID` and `SLACK_OAUTH_CLIENT_SECRET` (from the app's Basic Information
      page) in `.env`. Without it, the Connect button stays hidden and option B is the only path.
- [ ] **Slack, option B — paste a bot token directly, always available regardless of option A.**
      Create a Slack app with the same scopes as above, install it, invite the bot to the channels
      you want project updates posted to, then paste the bot token into the Slack card at
      `/integrations`. **The token previously kept in `.env` was still missing `users:read.email`**
      (the other four were added) — without it, a personal Slack DM for an urgent notification
      (`notification_dm`) is silently `SKIPPED` with "missing an OAuth scope" as the reason. Add it
      in the app's OAuth & Permissions page and reinstall the app before pasting the token in;
      everything else Slack does already works.
- [ ] **ClickUp, option A — set up the OAuth "Connect" button (D-053).** Same shape as Slack's:
      create an OAuth app at <https://app.clickup.com/settings/apps>, set its redirect URL to
      `<APP_URL>/api/oauth/clickup/callback`, then set `CLICKUP_OAUTH_CLIENT_ID` and
      `CLICKUP_OAUTH_CLIENT_SECRET` in `.env`. One-time, platform-level.
- [ ] **ClickUp, option B — paste an API token directly, always available.** Generate a personal
      or workspace API token from ClickUp's settings, paste it into the ClickUp card at
      `/integrations` (Team ID is optional there, for team-scoped endpoints).
- [ ] **Email.** Sign up for Resend (or swap the adapter — see `packages/integrations/src/email.ts`),
      verify a sending domain (Resend will give you SPF/DKIM DNS records to add), then paste the
      API key and the verified from-address into the Email card at `/integrations`. **The Resend
      account previously configured in `.env` had zero verified domains** (`GET /domains` returned
      an empty list) while `EMAIL_FROM` was set to an `@ahnmedia.com` address — every email in the
      outbox was failing permanently as a result. Verify `ahnmedia.com` (or whichever domain you
      use as the from-address) in the Resend dashboard first — `setOrganizationIntegrationAction`
      verifies the key live before saving it, so an unverified domain is rejected on the spot
      rather than silently broken later.
- [ ] **Link each real project to its Slack channel and ClickUp task.** Each project's own Settings
      page now has a connect/disconnect form for both (D-045) — open `/projects/<code>/settings` and
      use it directly; no script or database write needed any more.

## 4. People — provisioning is self-service now (D-051)

- [ ] **Invite your real AHN and SHOPLINE users directly.** `/people` → "Invite person" (needs
      `user:manage` - `AHN_ADMIN` or `SHOPLINE_ADMIN`) creates the account and emails a
      set-password link. No script, no database write.
- [ ] **Invite each real merchant from their project's Settings page.** "Invite to portal" (needs
      `merchant:manage` - an `AHN_PROJECT_MANAGER` already has it) creates the `User` and the
      `ProjectMember` row and emails the same kind of set-password link.
- [ ] **Password reset is self-service too** — `/forgot-password` on the sign-in page.
- [ ] Decide **who actually gets the first real invites, and in what order** — see
      `GOING-LIVE-DECISIONS.md` §2.

## 5. Product decisions worth confirming with the real AHN/SHOPLINE team

These were each built with a reasoned default so nothing stayed unbuilt waiting on an answer, but
they are genuine judgment calls, not technical ones — see `RBAC.md` §5 for the reasoning behind
each current answer:

- [ ] **O1** — Should an AHN project manager be able to record the merchant's own final approval on
      their behalf (e.g. when it arrived by email or phone)? Currently yes.
- [ ] **O2** — Should a SHOPLINE solutions engineer see invoice/payment information? Currently no.
- [ ] **O3** — Should merchants see the full blocker record for their project, not just a summary
      on their portal overview? Currently the summary only.

## 6. Ongoing, once live

- [ ] **Rotate `CREDENTIAL_ENCRYPTION_KEY` on a schedule you're comfortable with** — rotating it
      invalidates anything encrypted under the old key, so plan for that rather than doing it as a
      surprise.
- [ ] **Watch `/integrations`** for rows stuck `FAILED` (a revoked token, or a channel the bot was
      removed from — both need a human to fix, by design; see `RUNBOOK.md` → Diagnosing).
