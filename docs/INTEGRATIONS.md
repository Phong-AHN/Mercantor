# Relay — Integrations

Slack, ClickUp and email hang off the project record. **None of them owns project status.** The
portal is the source of truth; they are how it reaches people who are not looking at it.

---

## The seam

`packages/integrations/src/types.ts` defines three interfaces. Nothing above them contains
platform-specific code — callers deal in `SlackUpdate`, not Block Kit; in `ClickUpStatusUpdate`,
not ClickUp status ids.

`registry.ts` is the only place a platform is chosen:

| Provider | Live when                  | Otherwise    |
| -------- | -------------------------- | ------------ |
| Slack    | `SLACK_BOT_TOKEN` is set   | mock adapter |
| ClickUp  | `CLICKUP_API_TOKEN` is set | mock adapter |
| Email    | `RESEND_API_KEY` is set    | mock adapter |

The mock answers locally and records what it _would_ have sent, so the entire flow —
introduction email, Slack notification, ClickUp status sync — is demonstrable and testable with
no third-party credentials. Nothing above the seam knows which one it got. `/integrations` shows
which mode each provider is in and why.

Platform error strings never reach a user unmapped. Each adapter normalises them into a small
taxonomy carrying `retryable` and an optional `retryAfterMs`, which is exactly what the retry
policy needs.

---

## The outbox

Redis being unreachable must never fail a user's request. So:

```
mutation transaction
  ├─ the change itself
  ├─ ActivityEvent   (the human-readable history)
  ├─ AuditLog        (who did what)
  └─ OutboxMessage   (what to deliver)          ← same transaction
                     ↓ commit
             enqueue('integrations', { outboxId })   ← best effort
                     ↓
  apps/worker → provider → mark DELIVERED
```

If the enqueue fails it is logged and swallowed; the `retry-outbox` maintenance task sweeps
pending rows every two minutes. **An integration outage delays an update. It never loses one.**

Delivery backs off exponentially (30s → 1m → 2m … capped at 30m) and gives up after six attempts,
at which point the row shows as `FAILED` on `/integrations` rather than disappearing. A
non-retryable failure — a revoked token, a channel the bot is not in — is terminal on the first
attempt, because retrying it forever only hides the problem from the person who can fix it.

---

## Slack

**Portal → Slack.** Each project links one channel. These post automatically:

- stage changes (with the previous stage and who is now being waited on)
- blockers opened and resolved
- change requests raised — a commercial event, so SHOPLINE sees it
- approvals requested and decided
- blocking access verified or broken
- high and launch-blocking issues
- handoff submitted and decided
- any update posted with **Also post to Slack** ticked

Every message carries a button back to the project. **An `INTERNAL_AHN` note is never sent**, no
matter what the composer's checkbox says — that is enforced in the action, not in the UI.

**Portal → a person, directly.** The four urgent in-app notification types (D-027) also DM the
recipient in Slack, not only email: a launch blocker, a pending approval only they can decide, a
project ready for SHOPLINE review, a deployment decision (D-039). Their Slack account is found by
their work email at delivery time (`users.lookupByEmail`) — nothing is stored, and no manual "link
your Slack" step exists or is needed. Someone with no matching Slack account is not a failure: that
outbox row is marked `SKIPPED`, never retried, and never shown as an error on `/integrations`.

**Slack → portal.** Paste a message permalink into _Record a Slack message_ on the activity tab
and it is pulled into the project history with its author, text and a link back to the original.
That is the one direction Slack is allowed to write, and it is deliberate: important decisions get
made in Slack, and they should not stay only in Slack.

**To go live:** create a Slack app with `chat:write`, `channels:read`, `groups:read`,
`channels:history` and `users:read.email`, install it, invite it to the channels, and set
`SLACK_BOT_TOKEN`.

---

## ClickUp

**One direction only.** ClickUp stays AHN's internal execution layer; the portal stays the shared
AHN/SHOPLINE visibility layer. Stage changes push a status; comments can push a comment. The
portal never reads ClickUp status back as the truth.

`DEFAULT_CLICKUP_STATUS_MAP` in `packages/integrations/src/clickup.ts` translates portal stage →
ClickUp status, overridable per project through `IntegrationLink.config.statusMap`.

**To go live:** create a personal or workspace API token and set `CLICKUP_API_TOKEN`
(and `CLICKUP_TEAM_ID` if you use team-scoped endpoints), then link a task to each project.

---

## Email

Used today for the standardised merchant introduction, generated from the project record by
`packages/core/src/intro-email.ts` — merchant details, migration type, both contacts, the access
needed to start, next steps and a link to the portal. The exact body sent is stored on the
`IntroductionEmail` row, so what went out is never in doubt.

**To go live:** set `RESEND_API_KEY` and `EMAIL_FROM` with a verified sending domain.

> **Gap, stated plainly:** notification rows are not yet delivered as email. The provider and the
> outbox are both in place; wiring the four notification types that deserve an email is a small,
> deliberate follow-up.
