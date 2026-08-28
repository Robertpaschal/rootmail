# CLAUDE.md — working notes for rootmail

> ## ⛔ STANDING RULE — the dashboard's ease of use is not up for redesign
> **Owner, 2026-08-28: "we can improve the product to be cohesive in product
> design language but we cannot lose what worked and ease of access in the
> dashboard as it were."**
>
> Two things got conflated and must stay separate from now on:
>
> - **Visual language** — type, colour, depth, curves, motion. Cohesive across
>   all four apps, lives in `packages/design`, changes in one file, reversible.
>   Improve this freely.
> - **Information architecture and interaction** — what is in the nav, what a
>   page is, how a list is sorted, where things live. **This is the product.**
>   It is what users learned. Do not restructure it as a side effect of a visual
>   pass.
>
> Two specific failures, both reverted, both caused by agents redesigning
> behaviour while asked for design:
>
> 1. **The sidebar was cut to "Mail + Settings"** (`625a677`), deleting every
>    other destination. It shipped to production and the owner found it.
> 2. **Nine routes were reshaped** (`5a959da`) — `/messages` from a sortable
>    table into a "register", `/contacts` into a "roster", `/templates` into a
>    "shelf" — on the reasoning that operators ask a different question. That was
>    an opinion about users asserted with no evidence, and it removed working
>    capability (sorting by recipient). Reverted.
>
> **If a change alters what is in the nav, what a page IS, or removes a control
> that worked — that is a product decision. Ask. Do not ship it inside a design
> change.** Keeping the old pattern is the default; the burden of proof is on
> replacing it.


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
- **CI can be red for days without anyone noticing, because deploys don't wait
  for it.** The `Build & push images` workflow is independent of `CI`, so a
  failing smoke test never blocked a release. Flipping the `DNS_VERIFY_MODE`
  default to `live` broke the smoke on every commit for six days — CI had relied
  on the old `mock` default without stating it, and started doing real DNS
  lookups for a domain invented per run. Check `gh run list --workflow=CI` after
  changing any DEFAULT, and never let a test depend on one it doesn't set.
- **A full disk makes a deploy silently no-op.** Every deploy leaves a
  `sha-<commit>` image tag; they accumulate until SSM dies with "ipc messaging
  received timeout signal" — which looks like a broken tool, not a full disk —
  and the container stays up on the OLD image with nothing reporting an error.
  `docker image prune -af --filter "until=24h"` does NOT help (the sha tags are
  fresh, which is why they survive it); use `-af` with no age filter. A daily
  cron does this now, but always check `docker compose ps` really shows a fresh
  container after a deploy.
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
- **Drizzle `.nullsNotDistinct()`** isn't available in this version, so a unique
  index containing a nullable column does NOT constrain rows where it is null —
  Postgres treats NULLs as distinct, and `onConflictDoNothing` therefore never
  matches. `suppressions` duplicated workspace-level rows this way for months,
  inflating the counts that feed the reputation score. The fix is a **partial
  unique index** (`WHERE col IS NULL`) written by hand: Drizzle cannot express
  the WHERE clause, so do NOT also declare it in `schema.ts` or the next
  `db:generate` emits a full unique index that fails against real data.
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

## Design system — read before touching any UI

**`docs/design/00-PHILOSOPHY.md` is the constitution.** Read it, *including §9
Amendments and §10 The austerity correction*, before changing anything visual.
The one-line version: email is a chain of custody and the enemy is the black box.

**§10 reversed several §5/§9 rules — do not restore them from memory.** Radius is
`1rem` with a full scale (not `0.25rem`); depth is a token (`shadow-e1/e2/e3`),
not banned; type is **three** roles — Fraunces for headlines *and figures*,
Schibsted Grotesk for UI, JetBrains Mono for ids/timestamps/sourcing lines only.
Colour is no longer only ever state: **brass = what you can act on** (buttons,
links, focus), while `witnessed`/`acted`/`stopped` mean what happened to a
message and never appear on a control. `01-REFERENCES.md` is the measured evidence,
`02-AUDIT.md` the diagnosis it was written against.

**`packages/design` is the single source of ground, ink and type.** All four
apps import it. Before it existed they each kept a private copy of the theme and
had already drifted — different radii, and status colours hardcoded to raw
palette values with no dark-mode counterpart.

- `@rootmail/design/tokens.css` — imported at the TOP of each app's
  `globals.css`. It **remaps the shadcn names** (`--background`, `--primary`, …)
  onto the new palette, which is why re-grounding ~45k lines of TSX took one
  import per app. New work should prefer the semantic names (`--ink`,
  `--witnessed`).
- `@rootmail/design/preset` — the shared Tailwind preset. Each app's
  `tailwind.config.ts` is now `presets: [rootmailPreset]` plus anything
  genuinely app-only.
- `@rootmail/design` — `<Line>`, `<Metric>`, `<Fact>`, `messageStations()`.

**The rendering law.** `<Line>` has four states and they are not styling
choices: solid = we witnessed it, hollow = we *inferred* it (opens, anything
from a pixel or heuristic), dotted = we don't know or haven't built it, severed
= it stopped and a number says why. **Never draw a solid line through something
we did not observe.** `messageStations()` encodes this so a caller cannot get it
wrong — use it rather than hand-building stations. `<Metric>` requires `window`
and `method` by TYPE, so a naked number cannot be constructed.

**Consistency is checked, not asserted.** `scripts/design-audit.ts` scans all
four apps for the rules above and exits non-zero on a blocking violation:

```bash
pnpm exec tsx scripts/design-audit.ts                    # summary per app
pnpm exec tsx scripts/design-audit.ts --files            # every offending file
pnpm exec tsx scripts/design-audit.ts --rule=raw-palette --files
```

Run it before and after any UI work. It exists because a redesign that reaches
the homepage and stops is worse than no redesign — the product then reads as a
demo, and nobody notices the long tail until a customer does. It also caught the
reverse error: a naive `initial={{opacity:0}}` scan reported 84 violations, but
a panel that mounts on a click is legitimately absent until the click, so the
rule now exempts files using `AnimatePresence` and the real number was **6**.
When adding a rule, make it that specific or it will be ignored.

Gotchas learned building it:
- **`tokens.css` must not use `@layer base`.** Next resolves the import as its
  OWN PostCSS module, so Tailwind sees `@layer` with no matching `@tailwind`
  directive in that file and fails the build — with a webpack error that names
  only the generated module and never the cause. Custom properties don't need a
  layer, and outside one they still win over base.
- Each app needs `@rootmail/design` in **`transpilePackages`** (raw TS, same as
  `@rootmail/docs`) and `../../packages/design/src/**/*.{ts,tsx}` in its
  Tailwind `content`, or the package's own classes get purged.
- **`duration-300` should not survive review.** Motion is two tiers with an
  empty middle: `duration-interaction` (100ms) and `duration-narrative` (700ms).
- **admin overrides the ground on bare `:root` and never sets `.dark`** — so
  every token its override does not RESTATE keeps its **light** value while
  sitting on a near-black page, silently. This bit twice: `--brass-text` at its
  light cut is 3.48:1 there (fails AA), and `--elev-1/2/3` were light drop
  shadows, invisible on near-black, so `shadow-e*` did nothing in that app.
  **When you add a token to the `.dark` half of `packages/design/tokens.css`,
  restate it in `apps/admin/src/app/globals.css` too.**
- **admin has no light mode, on purpose.** Its stated reason to exist is that
  staff can tell at a glance they are not in a customer's dashboard, and its old
  light ground was the same cold grey the dashboard used — so in light mode the
  two consoles were near-indistinguishable, in exactly the case that matters.
  It now has one dark ground and its (now meaningless) theme toggle is gone.

## Conventions
- Public ids are prefixed: `newId("message")` → `msg_…` (`packages/core/src/ids.ts`).
- API keys: `rm_live_…` / `rm_test_…`; only the SHA-256 hash is stored. **Signup mints no
  key** — `provisionAccount` creates the Production + Sandbox workspaces but no API key;
  the dashboard runs on the user's session, and developers create keys on demand from
  Developers → API keys (test/live = the key's workspace). `db:seed` still mints its own key.
- API JSON is snake_case; TypeScript is camelCase. The SDK maps between them.
- Audit log is append-only — write new entries, never update.
- Validate request input with Zod via the `parse()` helper (returns the output type).
