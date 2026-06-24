# Deploy

What ships and how to run it in production. (CI gates every change — see
`.github/workflows/ci.yml`: typecheck + build + the 27-check e2e smoke.)

## Components
| Component | What | How |
|---|---|---|
| `apps/api` | Fastify REST gateway | Docker (`apps/api/Dockerfile`), port 4000, health `GET /health` |
| `apps/worker` | BullMQ send/webhook/sequence/campaign processor | Docker (`apps/worker/Dockerfile`), no port |
| `apps/dashboard` | Next.js operator console | Docker (`apps/dashboard/Dockerfile`), port 3000; calls the API server-side only |
| `apps/marketing` | Next.js marketing site | Docker (`apps/marketing/Dockerfile`), port 3000 |
| `apps/admin` | Next.js internal staff console | Docker (`apps/admin/Dockerfile`), port 3000; separate staff session |
| Postgres | primary store | managed (e.g. RDS) |
| Redis | queue + idempotency + rate limits | managed (e.g. ElastiCache) |

All five images build from the **repo root** (they need the whole workspace).
`docker-compose.prod.yml` defines the lot — bring up everything, or just the one
service a given host runs:

```bash
# whole stack on one host
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# or one service per host (our beta topology — one app per EC2 box)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build api
```

Individual images still build directly if you prefer:

```bash
docker build -f apps/api/Dockerfile -t rootmail-api .   # …worker, marketing, dashboard, admin
```

## Images & CI (preferred deploy path)

`.github/workflows/images.yml` builds all five images on GitHub's **amd64** runners and
pushes them to Docker Hub as `pachal/rootmail-<svc>:latest` (+ a `:sha-…` tag) on every
push to `main` (and on demand). This is the preferred path — it avoids building on the
small EC2 hosts, which `ENOSPC` on the ~1.4GB images. `docker-compose.prod.yml` resolves
each service to `${REGISTRY:-pachal}/rootmail-<svc>:${TAG:-latest}`, so a host deploy is a
**pull**, not a build:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml pull api
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d api
```

One-time setup:
- Repo secrets: `DOCKERHUB_USERNAME` (=`pachal`) + `DOCKERHUB_TOKEN` (a Docker Hub *access
  token*, not your password). `gh secret set DOCKERHUB_USERNAME -b pachal` then
  `gh secret set DOCKERHUB_TOKEN` (paste the token).
- If the Docker Hub repos are **private**, run `docker login` once on each host so it can pull.
- Trigger a build manually any time: `gh workflow run images.yml`.

> Changing `.env.prod` needs `up -d --force-recreate <svc>` — `restart` won't re-read it.
> The build-on-host fallback (`up -d --build`) still works; pair it with the disk-dance
> (stop → `docker rmi -f` old image → `docker builder prune -af` → bump swap) on tiny boxes.

## Infrastructure
- Postgres + Redis must be reachable from the api/worker. Managed instances are
  typically **VPC-only** (ElastiCache always; RDS unless made public) — run the
  api/worker **inside the VPC**. Use `?sslmode=require` on `DATABASE_URL` for RDS.
- Scale the worker horizontally (BullMQ concurrency); the api is stateless.

## Environment & secrets
The compose reads one gitignored **`.env.prod`** at the repo root as the single
source of truth (`--env-file .env.prod`). Backend secrets (DB, Redis, SES, Stripe,
signing keys) are loaded only into **api**/**worker**; the public-facing Next apps
(marketing/dashboard/admin) receive **only** the env they need — see the per-service
`environment:` lists in `docker-compose.prod.yml`. Never commit secrets
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

Wire this as a release/pre-deploy step. Migrations are the **only** required setup:
customers self-provision (org + workspaces + first API key) on signup, so do **not**
auto-`db:seed` in production (seed is for local/dev).

## Bootstrap the first staff (apps/admin)
No staff are seeded. The first staff account is created via a one-time, gated
bootstrap — allowed only while **zero** staff exist **and** the caller proves they
hold `INTERNAL_API_SECRET`; it closes permanently after. The first account is a
`superadmin`, who then creates the rest of the team in the admin UI (assign roles,
deactivate, reset passwords).

```bash
curl -X POST https://service.<domain>/v1/admin/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email":"ops@yourco.com","name":"Ops","password":"<choose-a-strong-one>","secret":"<INTERNAL_API_SECRET>"}'
```

After that, all staff management is in-app (superadmin → Staff): no CLI, no seed,
no hardcoded login in any environment. Roles: `superadmin` (everything), `billing`
(view + commerce/credit), `support` (view + suppressions/impersonate/leads),
`readonly` (view only).


## Webhooks (post-deploy)
- Stripe: point a webhook at `…/v1/webhooks/stripe`, set `STRIPE_WEBHOOK_SECRET`.
- SES feedback + inbound: SNS subscriptions → `…/v1/webhooks/ses` (raw delivery off).
  MX of `INBOUND_DOMAIN` → `inbound-smtp.<region>.amazonaws.com` + a receipt rule.
  **Order matters:** the API must be deployed and reachable at that public URL
  *first* — SNS delivers its subscription-confirmation POST to the endpoint, so if
  the app isn't serving yet there's nowhere to confirm. Deploy api → then create/
  confirm the SNS subscription (the endpoint auto-confirms on the confirmation POST).

## Still to wire (Phase 8 infra)
Observability (logs/metrics/alerts) + queue monitoring, automated backups, a
status page, load tests, and per-environment secret management. These need the
target platform; the app is otherwise deploy-ready.
