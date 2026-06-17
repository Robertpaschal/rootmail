# Deploy

What ships and how to run it in production. (CI gates every change — see
`.github/workflows/ci.yml`: typecheck + build + the 27-check e2e smoke.)

## Components
| Component | What | How |
|---|---|---|
| `apps/api` | Fastify REST gateway | Docker (`apps/api/Dockerfile`), port 4000, health `GET /health` |
| `apps/worker` | BullMQ send/webhook/sequence/campaign processor | Docker (`apps/worker/Dockerfile`), no port |
| `apps/dashboard` | Next.js operator console | Next host (Vercel or Node); calls the API server-side only |
| `apps/marketing` | Next.js marketing site | Static-friendly Next host |
| Postgres | primary store | managed (e.g. RDS) |
| Redis | queue + idempotency + rate limits | managed (e.g. ElastiCache) |

The api/worker images are built from the **repo root** (they need the whole
workspace):

```bash
docker build -f apps/api/Dockerfile    -t rootmail-api .
docker build -f apps/worker/Dockerfile -t rootmail-worker .
```

## Infrastructure
- Postgres + Redis must be reachable from the api/worker. Managed instances are
  typically **VPC-only** (ElastiCache always; RDS unless made public) — run the
  api/worker **inside the VPC**. Use `?sslmode=require` on `DATABASE_URL` for RDS.
- Scale the worker horizontally (BullMQ concurrency); the api is stateless.

## Environment & secrets
Set real values via your platform's secret manager — never commit them
(`.env.example` is placeholders only). The essentials:

- `DATABASE_URL`, `REDIS_URL`
- `PUBLIC_API_URL`, `DASHBOARD_URL`
- `MAIL_PROVIDER=ses` + `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`
  (or an instance role); `ROOTMAIL_DOMAIN`, `DKIM_SELECTOR`; `INBOUND_DOMAIN` for reply capture
- `STRIPE_SECRET_KEY` + price ids + `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `PROOF_SIGNING_KEY`, `LINK_SIGNING_SECRET`, `INTERNAL_API_SECRET`
- Asset storage: `ASSET_S3_BUCKET` (+ AWS creds) and `ASSET_PUBLIC_URL`
- OAuth (dashboard `.env.local`): Google/GitHub/Apple creds; `DNS_VERIFY_MODE=live`

Dashboard-only: `ROOTMAIL_API_URL` (server-side API base) and `INTERNAL_API_SECRET`
(must match the API's) so social-login user upsert works.

## Migrations
Run **before** rolling new api/worker (additive migrations are safe to run first):

```bash
pnpm db:migrate     # applies packages/db/migrations
```

Wire this as a release/pre-deploy step. Do **not** auto-`db:seed` in production
(seed is for local/dev).

## Webhooks (post-deploy)
- Stripe: point a webhook at `…/v1/webhooks/stripe`, set `STRIPE_WEBHOOK_SECRET`.
- SES feedback + inbound: SNS subscriptions → `…/v1/webhooks/ses` (raw delivery off).
  MX of `INBOUND_DOMAIN` → `inbound-smtp.<region>.amazonaws.com` + a receipt rule.

## Still to wire (Phase 8 infra)
Observability (logs/metrics/alerts) + queue monitoring, automated backups, a
status page, load tests, and per-environment secret management. These need the
target platform; the app is otherwise deploy-ready.
