# Mercantor — AHN × SHOPLINE Migration Portal

One merchant = one project record = one source of truth. Slack, ClickUp and email are
integrations around that record, not separate places where project status lives.

Mercantor is the shared portal AHN Media and SHOPLINE use to run every merchant migration from
introduction through deployment. Its whole design goal is that **one screen answers ten
questions** without anybody having to ask:

| Question                            | Where the answer comes from                                      |
| ----------------------------------- | ---------------------------------------------------------------- |
| Where is this project?              | current stage + phase, derived health                            |
| How long has it been running?       | `computeProjectTime` over the stage history                      |
| How long in the current stage?      | the open `StageEvent`, against the stage's target                |
| Who owns the next step?             | `nextActionOwner` / `nextActionOwnerTeam`                        |
| What are we waiting for?            | the open `Blocker`, or the recorded next action                  |
| Who owns the current delay?         | blocker ownership spans, falling back to the stage's owning team |
| Is anything blocking launch?        | open issues at `LAUNCH_BLOCKER` severity                         |
| Has the merchant approved it?       | the `MERCHANT_FINAL` and `DESIGN` approval checkpoints           |
| Has AHN been paid?                  | the invoice rollup for the project                               |
| When will it be ready for SHOPLINE? | remaining stage targets projected forward                        |

---

## Quick start

```bash
pnpm install
cp .env.example .env          # dev defaults work as-is
pnpm infra:up                 # Postgres 17, Redis 7, MinIO in Docker
pnpm db:migrate:deploy        # apply migrations
pnpm db:seed                  # seven merchants at seven points in the pipeline
pnpm dev                      # http://localhost:3000
pnpm dev:worker               # notifications, integrations, SLA sweeps
```

Sign in with any seeded account — the sign-in page lists them in development. The password
for all of them is `relay-demo-password`.

| Account                        | Sees                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `linh.tran@ahnmedia.example`   | AHN project manager — full delivery surface, money, handoff |
| `marcus.hale@ahnmedia.example` | AHN developer — delivery and QA, no commercial detail       |
| `priya.raman@shopline.example` | SHOPLINE account manager — status, blockers, deployment     |
| `dan.okafor@shopline.example`  | SHOPLINE solutions engineer — same, without invoices        |
| `owner@sunrisecoffee.example`  | Merchant — their own migration only, in the merchant portal |

---

## What is in the box

```
relay/
├── apps/
│   ├── web/            Next.js 15 App Router — UI and server actions. PRODUCES queue jobs.
│   └── worker/         Node service — BullMQ consumers. The ONLY job consumer.
├── packages/
│   ├── config/         env schema (zod), loadRootEnv
│   ├── observability/  pino logger, redaction, correlation ids
│   ├── core/           domain: stages, SLA maths, health, answers, checklists, errors
│   ├── db/             Prisma schema, migrations, seed, client
│   ├── rbac/           permissions, grant matrix, policy engine, navigation
│   ├── auth/           scrypt passwords, hashed sessions, sign-in
│   ├── integrations/   Slack / ClickUp / Email providers + mock adapters
│   ├── queue/          BullMQ queues, payload schemas, producer/consumer split
│   └── ui/             design system — tokens, primitives, required states
├── docs/               architecture, RBAC, design system, requirement coverage, runbook
└── scripts/            dev helpers: screenshots, end-to-end smoke, session minting
```

| Concern  | Choice                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Language | TypeScript, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`       |
| Web      | Next.js 15 App Router, React 19, Tailwind 4 with CSS-variable tokens         |
| Database | PostgreSQL 17 + Prisma 6, UUIDv7 keys, `Timestamptz(3)` in UTC               |
| Queue    | Redis 7 + BullMQ 5                                                           |
| Identity | Email + password, scrypt, HttpOnly session cookie; authorization in Postgres |
| Storage  | S3-compatible (MinIO locally)                                                |
| Tests    | Vitest, plus a Playwright end-to-end smoke script                            |

The stack, the package boundaries and the conventions are inherited from AHN Orbit — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what was kept, what was dropped, and why.
The predecessor's own documentation is preserved under `docs/_legacy-ahn-orbit/`.

---

## Commands

```bash
pnpm dev                 # web app
pnpm dev:worker          # background worker
pnpm verify              # format:check + lint + typecheck + test
pnpm test                # unit tests (no infrastructure)
pnpm test:integration    # real Postgres, real server actions - needs `pnpm infra:up`
pnpm build               # production build of every workspace
pnpm db:studio           # Prisma Studio
pnpm db:seed             # reset demo data (destructive)

node scripts/e2e-smoke.mjs                       # end-to-end smoke over a real browser
node scripts/shot.mjs '[["name","/dashboard"]]'  # screenshots for visual QA
```

---

## Documentation

| File                                                             | What it is                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                   | Topology, request lifecycle, queues, integration seam            |
| [`docs/DATABASE.md`](docs/DATABASE.md)                           | Schema rationale and the constraints that are load-bearing       |
| [`docs/RBAC.md`](docs/RBAC.md)                                   | Roles, the permission matrix, and how private notes stay private |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)                 | Tokens, components, and the UI rules every screen follows        |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)                   | Slack, ClickUp and email — the provider seam and the outbox      |
| [`docs/REQUIREMENTS-COVERAGE.md`](docs/REQUIREMENTS-COVERAGE.md) | Every line of the brief, mapped to where it lives                |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md)                             | Deploying, operating and debugging it                            |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                         | D-001… — the decisions that shaped the build                     |
| [`docs/HANDOFF.md`](docs/HANDOFF.md)                             | Read this first if you are picking the project up                |
