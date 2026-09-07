# Relay — TODO for you

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

## 2. Integrations — each is optional and mocked until you set its keys (`INTEGRATIONS.md`)

- [ ] **Slack.** Create a Slack app in your workspace with scopes `chat:write`, `channels:read`,
      `groups:read`, `mpim:read`, `im:read`, `channels:history`, `users:read.email`; install it;
      invite the bot to the channels you want project updates posted to. Set `SLACK_BOT_TOKEN`.
      **The token currently in `.env` is missing `channels:read`, `groups:read`, `mpim:read` and
      `im:read`** — add them in the app's OAuth & Permissions page and reinstall the app, or the
      channel picker on a project's Settings page will show "missing an OAuth scope" instead of a
      channel list (everything else Slack does - posting updates, pulling a message in - already
      works with the current token).
- [ ] **ClickUp.** Generate a personal or workspace API token from ClickUp's settings. Set
      `CLICKUP_API_TOKEN` (and `CLICKUP_TEAM_ID` if you use team-scoped endpoints).
- [ ] **Email.** Sign up for Resend (or swap the adapter — see `packages/integrations/src/email.ts`),
      verify a sending domain (Resend will give you SPF/DKIM DNS records to add), then set
      `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] **Link each real project to its Slack channel and ClickUp task.** Each project's own Settings
      page now has a connect/disconnect form for both (D-045) — open `/projects/<code>/settings` and
      use it directly; no script or database write needed any more.

## 3. People — there is no self-service account creation yet (`FUTURE-WORK.md` §1)

- [ ] **Decide who your real AHN and SHOPLINE users are** (name, email, role) and tell me — I can
      write a one-off provisioning script (distinct from `pnpm db:seed`, which wipes and rebuilds
      demo data — never run that against real data).
- [ ] **Decide how merchant accounts get created.** The same applies: a merchant contact needs a
      `User` row (role `MERCHANT`) and a `ProjectMember` row linking them to their one project.
      Until an invite flow exists, this is also a provisioning-script job.
- [ ] **Have a plan for a forgotten password.** There is no self-service reset yet — resetting one
      today means asking me to update the row directly. Worth deciding whether that is acceptable
      for launch or whether the reset flow (`FUTURE-WORK.md` §1) should be built first.

## 4. Product decisions worth confirming with the real AHN/SHOPLINE team

These were each built with a reasoned default so nothing stayed unbuilt waiting on an answer, but
they are genuine judgment calls, not technical ones — see `RBAC.md` §5 for the reasoning behind
each current answer:

- [ ] **O1** — Should an AHN project manager be able to record the merchant's own final approval on
      their behalf (e.g. when it arrived by email or phone)? Currently yes.
- [ ] **O2** — Should a SHOPLINE solutions engineer see invoice/payment information? Currently no.
- [ ] **O3** — Should merchants see the full blocker record for their project, not just a summary
      on their portal overview? Currently the summary only.

## 5. Ongoing, once live

- [ ] **Rotate `CREDENTIAL_ENCRYPTION_KEY` on a schedule you're comfortable with** — rotating it
      invalidates anything encrypted under the old key, so plan for that rather than doing it as a
      surprise.
- [ ] **Watch `/integrations`** for rows stuck `FAILED` (a revoked token, or a channel the bot was
      removed from — both need a human to fix, by design; see `RUNBOOK.md` → Diagnosing).
