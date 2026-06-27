# CLAUDE.md — working notes for rootmail

rootmail is a unified email-infrastructure platform (see `README.md`). This file
captures the non-obvious things an agent needs to work here productively.

## Layout
- `apps/api` — Fastify REST gateway (auth, idempotency, rate-limit, routes)
- `apps/worker` — BullMQ send pipeline (suppression → render → provider → audit)
- `apps/marketing` — Next.js (App Router) marketing site; standalone, **no backend deps** (keeps the modular boundary clean). Tailwind v3 + hand-written shadcn/ui (new-york).
- `apps/dashboard` — Next.js (App Router) operator console. Talks to the API **server-side only** (Server Components/Actions), authenticating as the **user**: the session token (`rm_session` httpOnly cookie) is sent as the Bearer, and the API accepts **both** session tokens and API keys (`apps/api/src/plugins/auth.ts`). So everyday use needs **no API key** — keys are an opt-in developer feature. Nav is grouped (Messaging/Audience/Content/Insights/Developers/Workspace) with a `/settings` hub. `ROOTMAIL_API_URL` (default `http://localhost:4000`).
- `apps/admin` — Next.js (App Router) **internal staff** console (Phase 7). Same server-side pattern as the dashboard but a **separate staff session** (`rm_staff_session` httpOnly cookie) over the cross-org `/v1/admin/*` API. Distinct near-black theme so staff can't confuse it with the customer dashboard. `pnpm admin` (dev). No staff are seeded — bootstrap the first one (a superadmin) via the gated, one-time `POST /v1/admin/auth/bootstrap` (`{email,password,secret:INTERNAL_API_SECRET}`; allowed only while zero staff exist, then closed). The superadmin manages the rest in-app (roles superadmin/billing/support/readonly, enforced by capability via `STAFF_ROLE_PERMISSIONS`).
- `packages/core` — ids, env, crypto, DKIM, DNS verify, queue, render, errors, shared `constants`
- `packages/db` — Drizzle schema (single `src/schema.ts`), client, migrations, seed
- `packages/sdk` — `@rootmail/node`
- `scripts/smoke.ts` — end-to-end acceptance test via the SDK

## Run it
```bash
pnpm install
pnpm infra:up            # Docker Postgres + Redis
pnpm db:migrate && pnpm db:seed   # seed prints API keys
pnpm api                 # terminal 1
pnpm worker              # terminal 2
ROOTMAIL_API_KEY=rm_live_... pnpm exec tsx scripts/smoke.ts
```

## Gotchas (learned the hard way)
- **Ports:** this machine already runs Postgres on 5432/5433/5434 and Redis on
  6379. rootmail's Docker publishes on **5435 / 6380** via `POSTGRES_PORT` /
  `REDIS_PORT` in `.env`. Keep `DATABASE_URL` / `REDIS_URL` in sync.
- **pnpm build scripts:** esbuild, msgpackr-extract, and `sharp` (Next.js's image
  optimizer, an optional dep of `next`) need approval. This lives in root
  `package.json` → `pnpm.onlyBuiltDependencies` (the `pnpm-workspace.yaml` setting
  was NOT honored by this pnpm version). Leave an ignored build unapproved and
  pnpm's pre-run dependency check fails *every* script with `ERR_PNPM_IGNORED_BUILDS`.
- **Next.js dev ports:** `apps/marketing` and `apps/dashboard` have no hardcoded
  `--port` — they use Next's default via the `PORT` env var. Port 3000 collides with
  Docker on this machine, so the preview harness (`.claude/launch.json`,
  `autoPort: true`) picks a free port. Run them with `pnpm marketing` / `pnpm dashboard`.
- **ioredis is duplicated** (BullMQ pins a different patch). We present our
  connection as BullMQ's `ConnectionOptions` at the boundary — see
  `bullConnection()` in `packages/core/src/queue.ts` and the cast in
  `apps/worker/src/index.ts`. Don't remove these casts.
- **BullMQ queue names can't contain `:`** → `SEND_QUEUE = "rootmail-send"`.
- **Drizzle `.nullsNotDistinct()`** isn't available in this version. Uniqueness
  that should treat workspace-level (null `sub_tenant_id`) rows as distinct from
  tenant rows is enforced in app code (select-then-write), not the DB.
- **DNS verification:** `DNS_VERIFY_MODE=mock` (default) auto-passes sub-tenant
  domain verification so the flow is demoable without a real domain. Set `live`
  for real TXT lookups.
- **No build step for internal packages.** `core`/`db` export TS source via
  `exports: "./src/index.ts"`; everything runs through `tsx` and type-checks via
  `tsc` with `moduleResolution: bundler`. Only `sdk` builds (tsup).

## Conventions
- Public ids are prefixed: `newId("message")` → `msg_…` (`packages/core/src/ids.ts`).
- API keys: `rm_live_…` / `rm_test_…`; only the SHA-256 hash is stored. **Signup mints no
  key** — `provisionAccount` creates the Production + Sandbox workspaces but no API key;
  the dashboard runs on the user's session, and developers create keys on demand from
  Developers → API keys (test/live = the key's workspace). `db:seed` still mints its own key.
- API JSON is snake_case; TypeScript is camelCase. The SDK maps between them.
- Audit log is append-only — write new entries, never update.
- Validate request input with Zod via the `parse()` helper (returns the output type).
