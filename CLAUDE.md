# CLAUDE.md — working notes for rootmail

> ## ⚠️ ACTIVE BRIEF — read before starting work
> **`docs/BRIEF-2026-08-18-positioning-gaps.md`** is the current priority order.
> It was written from an evidence-based audit against our validated buyer
> (vertical SaaS platforms that send on behalf of their own customers).
>
> **P0 is urgent: three claims we currently make in public are false.**
> `apps/marketing/src/components/site/subtenancy.tsx:31` promises tenant delivery
> isolation we do not enforce; `packages/db/src/seed-blog-refresh-2026-07.ts:24`
> claims automatic DKIM rotation that does not exist; `ROADMAP.md:37` claims test
> coverage that does not exist.
>
> **P1.4 is a half-day fix with real exposure:** `getScopedMessage()`
> (`apps/api/src/routes/messages.ts:122`) filters on `workspaceId` only, so the
> message, audit-trail, proof-bundle and event routes can serve one tenant's data
> to another. The list endpoint at line 490 already scopes correctly — copy it.
>
> **P1.1 is the wedge:** the per-tenant reputation enforcement loop. The scorer,
> the per-tenant attribution, the `disabled` enum value and the send-time gate all
> already exist — nothing connects them. Shipping it makes the isolation claim
> true, and that is the launch.
>
> Do not publish a claim the brief lists under "Never claim until the code lands."
>
> **Brief 2 — `docs/BRIEF-2026-08-18b-next-tranche.md`** is the current work queue,
> written after `afad1fc` and `d2c64ab` shipped. It is a case, not a defect list:
> the onboarding DNS cliff, a plain-English "why did this message fail" answer,
> silent DNS drift, and CI for the new test suite. It argues *against* per-tenant
> dedicated IPs for now. Push back in `docs/COLLAB.md`.
>
> **`docs/COLLAB.md`** is the standing channel between you and the Cowork agent
> that handles positioning and market research. Append there when you ship something
> that changes what we can honestly claim, when you find marketing copy that outruns
> the code, or when a build decision turns on what we want to be able to say.


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
pnpm test                # node:test via tsx — needs infra:up (see below)
```

## Tests
`pnpm test` (turbo → `core`, `db`, `api`). Runner is **node's built-in `node:test`
driven through `tsx`** — no test framework dependency, matching the "no build step"
setup. Files are `src/**/*.test.ts` beside the code.

Coverage is deliberately narrow: only the paths where a silent regression is a
customer-facing breach. Pure suites (`core/reputation`, `db/suppression`,
`db/segments`) need nothing. **`apps/api/src/routes/isolation.test.ts` needs Postgres
running** (`pnpm infra:up`) — it builds the real server and drives real HTTP via
`app.inject()`, because the leak it guards was one helper shared by four routes and a
unit test of that helper would not have noticed. It creates and tears down its own
org/workspace/tenants; it never depends on seed data.

When you change scoping on a message route, an audience, or the suppression rules,
run this before anything else — those are the tests that exist.

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
  **Custom JOB ids can't either** ("Custom Id cannot contain :"). A retry that
  built `msg_x:r1` threw at enqueue time, leaving the message `queued` with no
  job behind it — silently never sent. Use `-` (see `enqueueSend`).
- **Prod deploys MUST pass `--env-file .env.prod`.** The prod compose passes
  frontend config by INTERPOLATION (`ROOTMAIL_API_URL: ${PUBLIC_API_URL}`), and
  compose interpolates from a file literally named `.env` — which the hosts do
  not have. A plain `docker compose up -d` therefore recreates the web
  containers with every such var set to the EMPTY STRING: no crash, no failed
  healthcheck, just "Cannot reach the rootmail API at ." on every page. The
  backend services use `env_file:` instead, so the API keeps working and the
  breakage looks like a frontend bug. Took the admin console down for ~an hour.
  The compose warnings ("variable is not set. Defaulting to a blank string")
  ARE the alarm — read them.
- **A hand-written migration must be added to `meta/_journal.json`.** Drizzle
  applies the JOURNAL, not the directory listing. A `.sql` file no entry points
  at is skipped — and `db:migrate` still prints "✓ Migrations complete", so the
  deploy looks clean while the table isn't there. Cost a full deploy cycle on
  0064. `db:generate` maintains the journal for you; only hand-written files
  need the entry added by hand.
- **A Redis client handed to a plugin must be closed with the server.**
  `@fastify/rate-limit` does not own the client you pass it, so a bare
  `createRedis()` in `buildServer` outlives `app.close()` and the test process
  never exits — the suite HANGS rather than failing, which looks like an
  infinite loop in your own code. Register an `onClose` hook that quits it.
- **There is no single send chokepoint — `assertCanSend` is not it.** `POST
  /v1/messages` builds and enqueues inline and calls `tryConsumeQuota` /
  `assertTransactionalSendCapacity` directly; `dispatchMessage` serves OTHER
  callers; `assertCanSend` is only reached by the retry route; campaigns and
  sequences enter through the worker. A guard that must apply to all sending
  needs BOTH the route-level check and `reputationGate` in the worker (which is
  what stops mail already queued). Adding one and assuming coverage is how the
  staff stop-switch silently did nothing on the main path — an end-to-end test
  caught it; typecheck could not.
- **Adding an `AUDIT_EVENTS` value needs an `ALTER TYPE`.** `audit_entries.event`
  is a Postgres ENUM (`audit_event`), not text — so a new event name added to the
  TS array type-checks everywhere and then fails at runtime with `22P02 invalid
  input value for enum`. The migration must `ALTER TYPE "public"."audit_event"
  ADD VALUE IF NOT EXISTS '…'` *before* anything inserts it. (`audit_entries` is
  the enum one; other tables' `action` columns are plain text — don't generalise
  from those.)
- **Drizzle re-runs nothing whose journal `when` isn't NEWER than the last applied
  `created_at`.** Editing an already-applied migration file and re-running
  `db:migrate` is a silent no-op locally — it prints success and changes nothing.
  To re-apply during development, delete that row from
  `drizzle.__drizzle_migrations` first. (A host that never applied it is
  unaffected, which is why this only ever bites locally.)
- **Drizzle `.nullsNotDistinct()`** isn't available in this version. Uniqueness
  that should treat workspace-level (null `sub_tenant_id`) rows as distinct from
  tenant rows is enforced in app code (select-then-write), not the DB.
- **DNS verification:** `DNS_VERIFY_MODE=mock` (default) auto-passes sub-tenant
  domain verification so the flow is demoable without a real domain. Set `live`
  for real TXT lookups.
- **No build step for internal packages.** `core`/`db` export TS source via
  `exports: "./src/index.ts"`; everything runs through `tsx` and type-checks via
  `tsc` with `moduleResolution: bundler`. Only `sdk` builds (tsup).

- **Server components can't call helpers from `"use client"` modules.** Next only
  lets COMPONENTS cross that boundary. `phaseForStatus()` lived in a client module,
  a server page called it, and every campaign detail page threw in production —
  `tsc` is perfectly happy with it. Helpers a server component calls go in a plain
  module (see `campaigns/phase.ts`). Only walking the page catches this.
- **A form action's return value is discarded.** `<form action={fn}>` with
  `fn: Promise<void>` fails silently by construction — returning `{error}` changes
  nothing. Use `<ActionForm>` (`components/app/action-form.tsx`), which wraps the
  form in `useActionState` so the error has somewhere to go. This is why deletes
  used to look like they worked when they'd been refused.
- **Staged forms must keep every field mounted.** Unmounting a scene stops its
  fields submitting. The campaign composer hides inactive scenes instead — which
  is also why it has no slide transition between them.
- **Never send a real campaign/message from local.** `.env` has
  `MAIL_PROVIDER=ses`, so a send puts mail on the wire to synthetic addresses.
  Exercise the blocked path; leave the success path to a real account.
- **The browser preview pane freezes `requestAnimationFrame`.** Framer entrances
  stall at their `initial` values and exits never unmount. Assert on DOM text, not
  on animation completion — a faded screenshot there is not a bug.

- **Never `revalidatePath()` the page you are already on.** It re-renders the
  server tree and resets client state, so anything held in `useState` on that
  page is destroyed. `createChat` did this and the first message of every new
  assistant chat vanished from the screen — the run had really completed and
  really persisted, so the only symptom was the transcript disappearing. Only
  revalidate OTHER pages the action changed.

## Conventions
- Public ids are prefixed: `newId("message")` → `msg_…` (`packages/core/src/ids.ts`).
- API keys: `rm_live_…` / `rm_test_…`; only the SHA-256 hash is stored. **Signup mints no
  key** — `provisionAccount` creates the Production + Sandbox workspaces but no API key;
  the dashboard runs on the user's session, and developers create keys on demand from
  Developers → API keys (test/live = the key's workspace). `db:seed` still mints its own key.
- API JSON is snake_case; TypeScript is camelCase. The SDK maps between them.
- Audit log is append-only — write new entries, never update.
- Validate request input with Zod via the `parse()` helper (returns the output type).
