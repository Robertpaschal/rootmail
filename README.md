# rootmail

**Email infrastructure that scales with who's asking.**

One sending core that stays dead-simple for a solo developer, but exposes
sub-tenancy, conversation threading, full audit trails, and legal-grade proof as
the buyer's needs grow. Not "Resend + Mailchimp + Salesloft" — one data model
that happens to satisfy all three.

> **Status:** live in production and feature-complete — all three layers, first-party
> auth, billing, automation, an operator dashboard, and an internal staff console.
> What remains is a short list of owner-supplied credentials (live Stripe, etc.). See
> [`ROADMAP.md`](ROADMAP.md) — the single source of truth for what's built and what's next.

---

## The three-layer model

| Layer | What it adds | Status |
|---|---|---|
| **1 — Identity & Sending** | Workspaces send mail. A workspace can spawn **sub-tenants**, each with their own verified domain, DKIM keys, reputation, and contacts — reporting up to the parent. | ✅ Built |
| **2 — Conversation** | Every message is a thread; inbound replies are parsed, attached, and routed back (webhook + shared inbox); sequences exit on reply. | ✅ Built |
| **3 — Proof** | Cryptographically signed, exportable proof bundles of a message's full lifecycle, with a content hash. | ✅ Built |

A solo dev only ever touches Layer 1. A platform builder turns on sub-tenants. A
fintech turns on proof bundles. **Same API, same data model — nothing to migrate.**

## What's built today

**Sending (Layer 1)**
- **Send API** — `POST /v1/messages` (transactional/marketing/sales), Handlebars templates or inline HTML, scheduled sends, priorities.
- **Idempotency** — `idempotency_key` guarantees exactly-once sends.
- **Queue + worker** — Redis/BullMQ priority queue; the worker renders, checks suppression, routes to a provider, and records every transition.
- **Sub-tenancy** — `POST /v1/sub-tenants` provisions a customer's sending domain, returns DNS records (ownership + per-tenant DKIM + SPF), and `…/verify` checks them live.
- **Suppression & contacts** — bounces/complaints/unsubscribes checked before every send; contacts scoped per workspace or sub-tenant.
- **Audit trail** — append-only lifecycle log per message (`queued → sending → sent → delivered → opened → clicked …`).

**Conversation (Layer 2)**
- **Threads & inbound** — SES inbound parsed (`mailparser`), attached to threads via a `Reply-To` token, exposed as a shared inbox and a `message.received` webhook; reply-triggered sequences exit automatically.

**Proof (Layer 3)**
- **Proof bundles** — Ed25519-signed, exportable record of a message's lifecycle + content hash; public verification endpoint.

**Platform**
- **First-party auth** — email/password, email verification, password reset, TOTP MFA (+ recovery codes), brute-force lockout, Google/GitHub/Apple OAuth (light up with creds). Sign-in is **session-based**; API keys are for the API.
- **Operator dashboard** (`apps/dashboard`) — Next.js console: send/inspect, templates (no-code editor + AI drafts + uploads), sequences, campaigns, lists, inbox, contacts, webhooks, API keys, members/roles, billing, settings, ⌘K palette.
- **Billing** — plans + seats + add-ons + yearly, usage metering, tier-gating (→ `402 feature_locked`); Stripe (with a local fallback).
- **Webhooks** — signed, idempotent delivery with a per-endpoint delivery log; inbound SES feedback (bounce/complaint/delivery) → suppression.
- **RBAC** — built-in + custom roles, a permission matrix enforced on every mutation.
- **AI assistant** — drafts templates and can build/operate features through the gated API (inherits plan/role/credit limits).
- **Internal staff console** (`apps/admin`) — separate staff auth over a cross-org API: org directory, support inspection (sends + audit + proof), and audited impersonation.
- **`@rootmail/node` SDK** — typed client with `withSubTenant()` scoping.
- **Compliance** — CAN-SPAM footer (marketing/sales) injected before the content hash; GDPR export + account deletion.

## Architecture

```
apps/api        Fastify REST gateway — auth (sessions + API keys), rate limiting,
                idempotency, validation, routing, the cross-org /v1/admin surface
apps/worker     BullMQ pipeline — suppression → render → provider → audit
apps/marketing  Next.js marketing site (standalone, no backend deps)
apps/dashboard  Next.js operator console (server-side calls; httpOnly session cookie)
apps/admin      Next.js internal staff console (separate staff session)
packages/core   ids, env, crypto, DKIM keygen, DNS verify, queue, render, constants
packages/db     Drizzle schema + migrations + client (PostgreSQL)
packages/sdk    @rootmail/node — the official Node.js SDK
```

```
 SDK / curl / dashboard ──HTTPS──▶  apps/api  ──enqueue──▶  Redis (BullMQ)  ──▶  apps/worker
                                       │                                            │
                                       ▼                                            ▼
                                   PostgreSQL  ◀──────── status + append-only audit ┘
                                                                  │
                                                           provider (SES, or mock → .eml)
```

**Tech stack:** TypeScript · Fastify 5 · Drizzle ORM · PostgreSQL 16 · Redis 7 /
BullMQ · Next.js (App Router) · Tailwind · Zod · Handlebars · AWS SES · Stripe ·
Anthropic · pnpm + Turborepo.

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10
- Docker (for local Postgres + Redis)

## Quickstart (local development)

```bash
# 1. Install
pnpm install

# 2. Start Postgres + Redis (Docker)
pnpm infra:up

# 3. Configure (copy the template, then adjust if needed)
cp .env.example .env

# 4. Create the schema (migrations are the only required setup step)
pnpm db:migrate

# 5. Run the services
pnpm api          # http://localhost:4000
pnpm worker
pnpm dashboard    # the operator console
```

Then **sign up in the dashboard** — that provisions your organization, a live +
sandbox workspace, and a starter template (no seed needed). Everyday sending works
straight from the dashboard with no key; when you want the API or SDK, create a key
under **Developers → API keys**.

> Prefer a ready-made demo org + keys for poking at the API? `pnpm db:seed` prints
> a LIVE and a TEST key (and a local admin-console login). It's a convenience for
> local dev only — the hosted product is fully self-serve.

```bash
# Send your first email (create a key under Developers → API keys, or use the seed)
curl -s http://localhost:4000/v1/messages \
  -H "Authorization: Bearer rm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"to":"ada@example.com","template":"welcome",
       "variables":{"name":"Ada","product":"rootmail","action_url":"https://rootmail.io"}}'

# …or run the full end-to-end demo through the SDK
ROOTMAIL_API_KEY=rm_live_xxx pnpm exec tsx scripts/smoke.ts
```

With `MAIL_PROVIDER=mock` (the default), rendered emails land in
`.maildir/<message_id>.eml` — open them in any mail client. Set `MAIL_PROVIDER=ses`
for real delivery.

> **Ports:** Postgres/Redis default to `5432`/`6379`; set `POSTGRES_PORT`/
> `REDIS_PORT` in `.env` if those are taken (this repo ships on `5435`/`6380`).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://rootmail:rootmail@localhost:5435/rootmail` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6380` | Queue / idempotency / rate limits |
| `API_PORT` | `4000` | API listen port |
| `MAIL_PROVIDER` | `mock` | `mock` writes `.eml` files; `ses` sends via Amazon SES |
| `BILLING_MODE` | `local` | `local` uses built-in prices; `stripe` uses real Stripe |
| `DNS_VERIFY_MODE` | `mock` | `mock` auto-passes domain verification; `live` does real TXT lookups |
| `INBOUND_DOMAIN` | _(unset)_ | Enables inbound parsing (e.g. `reply.rootmail.io`) |
| `ROOTMAIL_DOMAIN` | `rootmail.io` | Root sending domain (SPF, defaults) |
| `MAILDIR` | `.maildir` | Where the mock provider writes emails |

See `.env.example` for the full set (AWS, Stripe, Anthropic, OAuth, proof signing key).

## API reference

`/v1/*` routes take `Authorization: Bearer <token>` — an API key (`rm_live_…` /
`rm_test_…`) **or** a session token. Scope a request to a sub-tenant with
`X-Rootmail-Subtenant: <tnt_id>`. JSON is snake_case.

- **Auth & account** — `…/auth/signup|login|logout|me`, `verify-email(+/resend)`, `forgot-password`, `reset-password`, `mfa/{setup,activate,verify,disable}`, `oauth/*`; `…/organization` (GET/PATCH), `…/account/export`, `DELETE …/account`.
- **Messages** — `POST /v1/messages`, `GET /v1/messages(/:id)`, `…/:id/audit`, `…/:id/proof`, `…/:id/events`.
- **Sub-tenants** — `POST/GET /v1/sub-tenants(/:id)`, `…/:id/verify`.
- **Contacts & suppression** — `POST /v1/contacts`, `GET /v1/contacts/:email`, `…/unsubscribe`, `GET /v1/suppressions/check`.
- **Templates** — CRUD `/v1/templates(/:id)` + `…/ai-draft`. **Assistant** — `POST /v1/assistant`.
- **Sequences** — CRUD `/v1/sequences(/:id)` + `…/enroll`, `…/enrollments`.
- **Lists** — CRUD `/v1/lists(/:id)` + `…/contacts`. **Campaigns** — `/v1/campaigns(/:id)` + `…/send`.
- **Threads** — `GET /v1/threads(/:id)`, `…/:id/reply`.
- **Webhooks** — CRUD `/v1/webhook-endpoints(/:id)` + `…/deliveries`; inbound `POST /v1/webhooks/ses` (SNS-verified).
- **Team** — `/v1/members`, `/v1/roles`, `/v1/invitations`; **API keys** — `/v1/api-keys` (create/list/revoke — multiple per workspace); **Assets** — `/v1/assets`.
- **Billing** — `GET /v1/billing`, `…/checkout`, `…/plan`, `…/addons`.
- **Proof (public)** — `POST /v1/proof/verify`. **Admin (staff)** — `/v1/admin/*` (auth, orgs directory/detail, messages, impersonate).
- **Ops** — `GET /health`.

## SDK

```ts
import { RootMail } from "@rootmail/node";

const mail = new RootMail({ apiKey: process.env.ROOTMAIL_API_KEY! });

// Transactional send
await mail.send({
  to: "user@example.com",
  template: "password-reset",
  variables: { reset_url, user_name },
  idempotencyKey: `pwd-reset-${user.id}`,
});

// Give a platform customer their own sending domain, then send as them
const tenant = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "sunsetvillas.com",
  externalId: "customer_8821",
});
await mail.subTenants.verify(tenant.id);
await mail.withSubTenant(tenant.id).send({
  to: "guest@gmail.com",
  subject: "Your booking is confirmed",
  html: "<h1>See you soon!</h1>",
});

// Inspect the audit trail / proof
const { trail } = await mail.messages.audit(message.id);
const proof = await mail.messages.proof(message.id);
```

The SDK also covers templates, sequences, lists, campaigns, threads, and webhook
endpoints (with delivery logs). See [`packages/sdk/README.md`](packages/sdk/README.md).

## Project layout

```
rootmail/
├── apps/
│   ├── api/        Fastify REST API (+ /v1/admin)
│   ├── worker/     BullMQ send worker
│   ├── marketing/  Next.js marketing site
│   ├── dashboard/  Next.js operator console
│   └── admin/      Next.js internal staff console
├── packages/
│   ├── core/       shared domain logic (ids, env, crypto, dkim, dns, queue, render, constants)
│   ├── db/         Drizzle schema, migrations, client, seed
│   └── sdk/        @rootmail/node
├── scripts/smoke.ts   end-to-end acceptance test
├── docker-compose.yml Postgres + Redis
└── turbo.json
```

## Development scripts

| Command | Description |
|---|---|
| `pnpm typecheck` | Type-check every package |
| `pnpm infra:up` / `infra:down` / `infra:reset` | Start / stop / wipe Postgres + Redis |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Migrations · apply · seed (dev) · Drizzle Studio |
| `pnpm create-staff --email=… --role=…` | Bootstrap an `apps/admin` staff login (no seed needed) |
| `pnpm api` / `pnpm worker` | Run the API · the worker |
| `pnpm marketing` / `pnpm dashboard` / `pnpm admin` | Run each Next.js app |

## Roadmap

[`ROADMAP.md`](ROADMAP.md) is the living, single source of truth — what's built and
the prioritized work that remains (production deploy + a few owner-supplied
credentials).

## License

UNLICENSED — proprietary. All rights reserved.
