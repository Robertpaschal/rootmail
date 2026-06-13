# rootmail

**Email infrastructure that scales with who's asking.**

One sending core that stays dead-simple for a solo developer, but exposes
sub-tenancy, full audit trails, and (soon) conversation threading and
legal-grade proof as the buyer's needs grow. Not "Resend + Mailchimp +
Salesloft" — one data model that happens to satisfy all three.

> Status: **Phase 1 foundation + the sub-tenancy wedge** is built and verified
> end-to-end locally. See [Roadmap](#roadmap) for what's next.

---

## The three-layer model

| Layer | What it adds | Status |
|---|---|---|
| **1 — Identity & Sending** | Workspaces send mail. A workspace can spawn **sub-tenants**, each with their own verified domain, DKIM keys, reputation, and contacts — reporting up to the parent. | ✅ Built |
| **2 — Conversation** | Every message is a thread; inbound replies are parsed, attached, and routed back (webhook / shared inbox). | ⏳ Planned |
| **3 — Proof** | Cryptographically signed, exportable proof bundles of a message's full lifecycle. | ⏳ Planned |

A solo dev only ever touches Layer 1. A platform builder turns on sub-tenants.
A fintech turns on proof bundles. **Same API, same data model.**

## What's built today

- **Send API** — `POST /v1/messages` (transactional/marketing/sales), Handlebars templates or inline HTML, scheduled sends, priorities.
- **Idempotency** — `idempotency_key` guarantees exactly-once sends.
- **Queue + worker** — Redis/BullMQ priority queue; a worker renders, checks suppression, routes to a provider, and records every transition.
- **Sub-tenancy wedge** — `POST /v1/sub-tenants` provisions a customer's sending domain, returns DNS records (ownership + per-tenant DKIM + SPF), and `…/verify` checks them live (or auto-passes in local `mock` mode).
- **Full audit trail** — append-only lifecycle log per message: `queued → sending → sent → delivered → opened → clicked …`.
- **Suppression** — bounces, complaints, and unsubscribes are checked before every send.
- **Contacts** — upsert, lookup, unsubscribe, suppression checks, scoped per workspace or sub-tenant.
- **`@rootmail/node` SDK** — typed client with `withSubTenant()` scoping.
- **Mock provider** — writes a real `.eml` to `.maildir/` so you can preview sends with no ESP account.

## Architecture

```
apps/api      Fastify REST gateway — auth (API keys), rate limiting,
              idempotency, validation, routing
apps/worker   BullMQ send pipeline — suppression → render → provider → audit
packages/db   Drizzle schema + migrations + client (PostgreSQL)
packages/core ids, env, crypto, DKIM keygen, DNS verification, queue, render
packages/sdk  @rootmail/node — the official Node.js SDK
```

```
 SDK / curl ──HTTPS──▶  apps/api  ──enqueue──▶  Redis (BullMQ)  ──▶  apps/worker
                           │                                            │
                           ▼                                            ▼
                       PostgreSQL  ◀──────── status + append-only audit ┘
                                                              │
                                                       provider (mock → .eml)
```

**Tech stack:** TypeScript · Fastify 5 · Drizzle ORM · PostgreSQL 16 · Redis 7 / BullMQ · Zod · Handlebars · pnpm + Turborepo.

## Prerequisites

- Node.js ≥ 20 (tested on 24)
- pnpm ≥ 10
- Docker (for local Postgres + Redis)

## Quickstart

```bash
# 1. Install
pnpm install

# 2. Start Postgres + Redis (Docker)
pnpm infra:up

# 3. Configure (copy the template, then adjust if needed)
cp .env.example .env

# 4. Create the schema and seed a demo org + API keys
pnpm db:migrate
pnpm db:seed          # prints a LIVE and a TEST API key — copy them

# 5. Run the services (two terminals)
pnpm api              # http://localhost:4000
pnpm worker

# 6. Send your first email (use the key from step 4)
curl -s http://localhost:4000/v1/messages \
  -H "Authorization: Bearer rm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"to":"ada@example.com","template":"welcome",
       "variables":{"name":"Ada","product":"rootmail","action_url":"https://rootmail.io"}}'

# …or run the full end-to-end demo through the SDK
ROOTMAIL_API_KEY=rm_live_xxx pnpm exec tsx scripts/smoke.ts
```

Rendered emails land in `.maildir/<message_id>.eml` — open them in any mail client.

> **Ports:** Postgres and Redis default to `5432` / `6379`. If those are taken,
> set `POSTGRES_PORT` / `REDIS_PORT` in `.env` (and match `DATABASE_URL` /
> `REDIS_URL`). This repo's `.env` ships on `5435` / `6380`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://rootmail:rootmail@localhost:5435/rootmail` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6380` | Queue / idempotency / rate limits |
| `API_PORT` | `4000` | API listen port |
| `DNS_VERIFY_MODE` | `mock` | `mock` auto-passes domain verification; `live` does real DNS TXT lookups |
| `MAIL_PROVIDER` | `mock` | `mock` writes `.eml` files; `sendgrid` is a stub |
| `ROOTMAIL_DOMAIN` | `rootmail.io` | Root sending domain (used in SPF, defaults) |
| `DKIM_SELECTOR` | `rootmail` | DKIM selector for sub-tenant domains |
| `MAILDIR` | `.maildir` | Where the mock provider writes emails |

## API reference

All `/v1/*` routes require `Authorization: Bearer <api_key>`. Scope a request to
a sub-tenant with the `X-Rootmail-Subtenant: <tnt_id>` header.

**Messages**
- `POST /v1/messages` — send (template or inline `subject`+`html`; supports `idempotency_key`, `send_at`, `priority`, `sub_tenant_id`)
- `GET /v1/messages` — list (`?limit=&status=`)
- `GET /v1/messages/:id` — retrieve
- `GET /v1/messages/:id/audit` — full lifecycle trail
- `POST /v1/messages/:id/events` — record a lifecycle event (provider callback / simulation)

**Sub-tenants**
- `POST /v1/sub-tenants` — provision a domain, returns DNS records to publish
- `GET /v1/sub-tenants` · `GET /v1/sub-tenants/:id`
- `POST /v1/sub-tenants/:id/verify` — check DNS and flip to `verified`

**Contacts & suppression**
- `POST /v1/contacts` — upsert · `GET /v1/contacts/:email`
- `POST /v1/contacts/unsubscribe` · `GET /v1/suppressions/check?email=`

**Ops**
- `GET /health` — Postgres + Redis health

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

// Give a platform customer their own sending domain
const tenant = await mail.subTenants.create({
  name: "Sunset Villas",
  sendingDomain: "sunsetvillas.com",
  externalId: "customer_8821",
});
// → tenant.dns_records: embed in your own onboarding UI
await mail.subTenants.verify(tenant.id);

// Send as that sub-tenant (from bookings@sunsetvillas.com)
await mail.withSubTenant(tenant.id).send({
  to: "guest@gmail.com",
  subject: "Your booking is confirmed",
  html: "<h1>See you soon!</h1>",
});

// Inspect the full audit trail
const { trail } = await mail.messages.audit(message.id);
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for the full API.

## Project layout

```
rootmail/
├── apps/
│   ├── api/        Fastify REST API
│   └── worker/     BullMQ send worker
├── packages/
│   ├── core/       shared domain logic (ids, env, crypto, dkim, dns, queue, render)
│   ├── db/         Drizzle schema, migrations, client, seed
│   └── sdk/        @rootmail/node
├── scripts/smoke.ts   end-to-end demo / acceptance test
├── docker-compose.yml Postgres + Redis
└── turbo.json
```

## Development scripts

| Command | Description |
|---|---|
| `pnpm typecheck` | Type-check every package |
| `pnpm infra:up` / `infra:down` | Start / stop Postgres + Redis |
| `pnpm infra:reset` | Stop and wipe volumes |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Apply migrations · seed · open Drizzle Studio |
| `pnpm api` / `pnpm worker` | Run the API · the worker |

## Roadmap

- **Phase 2 — Conversation (Layer 2):** inbound parsing, threads, shared inbox, sequence exit-on-reply, second provider + fallback, marketing unsubscribe pages, Python SDK.
- **Phase 3 — Events & Sequences:** `POST /v1/events`, event-triggered sequences with delays/conditions, campaigns + A/B, RBAC.
- **Phase 4 — Proof (Layer 3) & scale:** Ed25519-signed proof bundles, dedicated IPs + warming, ClickHouse analytics, EU data residency, GDPR tooling, SSO.

## License

UNLICENSED — © Acme. Internal project.
