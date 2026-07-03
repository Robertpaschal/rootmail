# rootmail — Roadmap & Plan of Action

The single source of truth for **what's built** and **what's next**. Supersedes
the old phased roadmap and the separate product-audit POA (both folded in here).

> **How we work:** every item is a branch → PR, committed at each checkpoint (◇).
> Each item is **independent, complete, and verified** before it's checked off —
> no TODOs left behind, no placeholders, real copy/links/values, tests where
> behaviour can regress. **Truthful by default:** if we say it, the code does it.
> Status: `[ ]` todo · `[~]` in progress · `[x]` done. Updated 2026-06-24.

---

## The product today (honest snapshot)

rootmail is **feature-complete** as a unified email platform. All three layers of
the model are built and verified locally:

- **Layer 1 — Identity & Sending:** workspaces, API + Node SDK, templates
  (no-code editor + AI drafts + uploads), idempotent sends, priorities/scheduling,
  suppression, append-only audit, **sub-tenancy** (per-tenant domains/DKIM/reputation).
- **Layer 2 — Conversation:** threads, inbound MIME parsing, shared inbox,
  reply-routing via `Reply-To` token, sequence exit-on-reply.
- **Layer 3 — Proof:** Ed25519-signed, exportable lifecycle proof bundles + content hash.

Plus: first-party **auth** (email/password, verification, reset, TOTP MFA, lockout,
OAuth scaffold), **billing** (plans/seats/add-ons/yearly, tier-gating → 402),
**sequences/campaigns/lists**, **webhooks** (signed, delivery log), **RBAC**, an
agentic **AI assistant**, and a separate internal **staff admin console**
(`apps/admin`: cross-org directory, support inspection, audited impersonation).

**Commercial & ops layer (all shipped + verified):** Sales CRM (public contact
form → leads → pipeline) + admin-created **custom enterprise plans** (per-org
economics, enforced + Stripe-billed); **discounts/sales** everywhere pricing renders
(plans + add-ons, honest charge); **on-page embedded checkout** (configure tiers +
add-ons with a live total, pay without leaving the site); rootmail **dogfooding its
own email** for lifecycle (welcome/invite/dunning/trial) + admin broadcast; full
**dark mode**. A code scan shows **no TODOs or stubs** — every feature has a test or
browser verification.

**Apps:** `api` (Fastify) · `worker` (BullMQ) · `marketing` (Next) · `dashboard`
(Next) · `admin` (Next). **Live services:** Stripe (test mode, incl. embedded
checkout), Anthropic (`claude-opus-4-8`), SES send path, Ed25519 proof signing.

**The work now is not "more features" — honest, polished, and abuse-proof are done.
The one thing left is _production launch_** (infra + the owner-supplied switches
below) — everything is wired in code with a safe dev fallback, so it's all
incremental.

---

## NOW — active plan (ordered least-blocking first)

### 1. Truth — make every claim accurate ✅ *(branch `feat/marketing-truth`)*
- [x] **1.1 README** — rewritten: all 3 layers built, full architecture (5 apps),
      complete verified `/v1` reference, session-or-key auth, self-serve quickstart
      (seed reframed as dev-only), points to ROADMAP, real license.
- [x] **1.2 Marketing accuracy** — `layer-model` (Layers 2 & 3 → Available),
      `features` broadened to the full platform (threads/inbox, proof, sequences/
      campaigns, AI studio), `faq` ("Conversation & Proof are live"); hero/CTA
      reframed off "Phase 1 / pnpm db:seed" to hosted signup.
- [x] **1.3 Legal (counsel-grade)** — privacy / terms / DPA rewritten as complete
      professional documents (lawful bases, real sub-processors, GDPR/CCPA rights,
      AUP, liability cap, Delaware governing law, SCCs, Annexes); all "starting
      template" disclaimers removed; security reviewed.
- [x] **1.4 Dead-link sweep** — every footer/nav `href="#"` removed; all signup/
      sign-in CTAs → one configurable dashboard URL; "Contact sales"/contact →
      mailto. Verified clean in `apps/marketing`.
  - [ ] follow-up: add a CI grep guard so dead `#`/placeholders can't regress.
  - ◇ ships as one PR: "make it honest." Verified in-browser; typecheck green.

### 2. Pricing accuracy + UX polish *(branch `feat/pricing-polish`)*
- [x] **2.1 Pricing accuracy** — every tier's quota/price/seats/overage verified
      against the enforced `packages/core` PLANS (Free 3k/$0, Pro 50k/$20/$0.85,
      Scale 250k/$80/$0.70, Ent 1M/custom/$0.50) — no drift. (Build-time derivation
      skipped: marketing keeps the no-backend-deps boundary; kept the source comment.)
- [x] **2.2 Pricing UI polish** — equal-height cards, CTAs pinned to one bottom
      baseline, min-height blurbs so prices/included-boxes align, centered "Most
      popular", PAYG + baseline widened to match the card grid; CTAs already live.
      Verified in-browser.
- [x] **2.3 Broader UX/a11y pass** *(branch `feat/ux-a11y`)* — audited icon-only
      controls across all three apps: copy / command-menu / addon ± / send / add /
      enroll / nav toggles already carry `aria-label`s; fixed the one gap (the
      sequence-step remove button). Closed the real responsive gap: **admin gained a
      mobile nav** (sidebar is hidden < md). Browser-verified at mobile width. The
      visual UX was already polished + screenshot-verified during the build phases.

### 3. Anti-abuse hardening — "can't game it" *(branch `feat/anti-abuse`)*
Threat-modelled **price · service · product**; documented in `SECURITY.md`
("Abuse & billing integrity").
- [x] **3.1 Billing integrity** — usage is **per-org** (extra workspaces/sub-tenants
      can't multiply quota); Free hard-cap reserved with an atomic conditional
      `UPDATE … WHERE used+n<=quota` so concurrent bursts can't overshoot it
      (`tryConsumeQuota`; regression test `apps/api/scripts/test-quota.ts`, in CI);
      idempotency replay short-circuits before counting and a race-loser refunds its
      reserve; test-mode never meters; **self-upgrade fail-closed** — `checkout` and
      `addons` no longer grant free plan/entitlements in Stripe mode if no real
      Stripe session/billing exists. **Overage metering to Stripe still blocked on
      the overage price IDs** (overage is shown, not charged — by design until wired).
- [x] **3.2 Plan-boundary integrity** — verified already enforced: 402 `feature_locked`
      gates on every gated route incl. the sub-tenant send re-check (5.2 downgrade
      guard), permission matrix audited (5.3).
- [x] **3.3 Abuse limits** — verified already enforced: per-IP signup cap (5.5),
      unverified send-gate on **both** key + session sends (2.2), login/MFA lockout (2.5).
- [x] **3.4 Service abuse** — verified already enforced: global + per-route rate limits,
      webhook SSRF guard, signed idempotent inbound webhooks, Ed25519 proof with
      content-hash, role-gated + audited impersonation (7.2b).
- [x] _Minor residual — FIXED 2026-07-02:_ AI-credit metering is now atomic like the
      send quota (`tryConsumeAiCredit` reserves one credit in a single conditional
      UPDATE before the run; the real call count is reconciled after, refunding
      keyless/failed runs).

### 4. Auth & no-seed operability *(branch `feat/auth-no-seed`)*
- [x] **4.1** Verified: sign-in is **session-only** (email/password + OAuth; no
      key-login path anywhere). Multiple API keys already supported with a polished
      UX — `last_used_at` is written on every key use (`plugins/auth.ts`) and shown
      in the dashboard keys table alongside name / created / revoke.
- [x] **4.2 Social signups** — verified: OAuth buttons render **only** for configured
      providers (`enabledProviders()` → nothing when none), so no dead buttons; the
      Google/GitHub/Apple flow is wired and activates once creds are present.
- [x] **4.3 No-seed** — customers self-provision on signup; added `pnpm create-staff`
      (`--email/--password/--name/--role`, generates a password if omitted, resets on
      re-run) so `apps/admin` is bootstrapped with **only migrations applied** — no
      `db:seed`. Documented in CLAUDE.md + DEPLOY.md. Verified end-to-end (create →
      login; password reset → old fails, new works).

### 5. API / SDK / docs contract *(branch `feat/api-sdk-docs`)*
- [x] **5.1** SDK parity closed for the developer (API-key) surface — added
      `campaigns.get/update`, `sequences.cancelEnrollment`, `threads.simulateReply`,
      and a full **`webhooks`** resource (CRUD + `deliveries`, signing secret on
      create). Errors are consistent (`RootMailError` ← `error.type/message/details`),
      snake/camel mapped at the boundary. `scripts/smoke.ts` now exercises the new
      methods — **34 checks, all green**. README API reference + SDK README updated
      (session/admin/webhook-inbound endpoints are intentionally web-app/staff-only,
      not in the dev SDK). Docs verified: no stale "Layer 1 only", no dead links.
- [~] **5.2 OpenAPI — deferred (not needed yet).** The contract is already accurate
      and drift-guarded by the typed SDK + the README reference + the 34-check smoke
      (it fails if the surface breaks). A generated spec pays off when a **public API**
      with external integrators needs codegen / an interactive explorer — revisit then.
      (Routes validate via Zod `parse()`, not JSON schemas, so it'd need a zod→openapi
      pipeline.)

### 6. Admin console — remaining modules *(Phase 7 cont.)*
- [x] **Analytics** *(branch `feat/admin-analytics`)* — `GET /v1/admin/analytics`
      (plan mix + MRR estimate, email volume + trend, deliverability rates, AI
      credits, 30d growth) and an Analytics page (stat cards + plan-mix /
      deliverability / volume bars). curl + browser verified.
- [x] **Suppression management** *(branch `feat/admin-suppressions`)* —
      `GET /v1/admin/orgs/:id/suppressions` + `DELETE /v1/admin/suppressions/:id`
      (role-gated, audited); org-detail "Suppressions" card with per-row Clear
      (form → action → revalidate). curl + browser verified (list/clear/persist).
- [x] **Billing wiring** *(branch `feat/stripe-billing`)* — checkout now builds the
      full subscription (plan + add-ons + metered overage item); **add-on changes
      sync to Stripe subscription items** (add/update/remove, with rollback if Stripe
      fails — live-verified in test mode); **overage reported via the Billing Meter**
      (delta-tracked, `usage_records.overage_reported_units`), lazy on bill view;
      env split `STRIPE_PRICE_OVERAGE_PRO/_SCALE` + `STRIPE_METER_OVERAGE_PRO/_SCALE`.
      `pnpm --filter @rootmail/api test:stripe` checks it. _Activation pending the
      overage price/meter fix in "Blocked on you."_
- [x] **Billing ops** *(branch `feat/admin-billing-ops`)* — `GET /v1/admin/orgs/:id/
      billing` (live Stripe: subscription items, recent invoices, balance) + audited
      `POST …/credit` (goodwill account credit via Stripe customer balance,
      superadmin-only). Org-detail "Billing" card: balance, subscription items,
      invoices, grant-credit form. `test:billing-ops` e2e-verifies it in test mode
      (sub + invoice read; $5 credit → balance −500). _Refunds/dunning: future._
- [~] **Pricing management — fully admin-controlled, in phases** *(branch
      `feat/pricing-data-driven`)*. Goal: nothing constant; admin edits everything,
      Stripe-synced; trials/promotions/coupons/discounts.
  - [x] **Phase A — data-driven plans.** `plans` table (migration 0018) seeded from
        the constants (zero behavior change); a cached, DB-backed loader (`lib/plans.ts`,
        boot-warmed + 30s TTL + refresh-on-edit) with constant fallback. **All
        enforcement + display reads rewired** off the constants (quota, overage, seats,
        sub-tenants, feature-gate target, AI credits, MRR, billing display). Admin
        `GET/PATCH /v1/admin/plans` (superadmin, audited) + a Pricing editor page.
        Edits go live immediately. Verified: curl + browser (edit → reflected).
  - [x] **Phase B — Stripe price sync** *(branch `feat/pricing-stripe-sync`)*. Editing
        a plan's billed price creates NEW Stripe monthly+yearly prices on the plan's
        product (yearly = 10× = 2 months free), sets the monthly as the product
        default, archives the prior synced prices (existing subs **grandfathered** —
        a v1/v2 model), and stores the new ids. `priceForPlan` prefers the synced
        price, falling back to env. Checkout/cache pick it up immediately; the admin
        editor shows "Stripe price synced". `test:pricing-sync` verifies it in test
        mode (new prices + default + archive); browser-verified.
  - [~] **Phase C — promotions** *(branch `feat/promotions`)*.
    - [x] **C.1 coupons + promo codes** — admin `GET/POST /v1/admin/promotions` +
          `…/:id/deactivate` (Stripe-native coupons + promotion codes; percent or
          amount, once/repeating/forever; superadmin, audited). Admin **Promotions**
          page (create form + codes table + deactivate). Redeemable at checkout
          (allow_promotion_codes already on); dashboard billing shows a "have a promo
          code?" hint. curl + browser verified (create/list/deactivate, %/$ types).
    - [x] **C.2 trials** — `plan.trial_days` (admin-editable) → checkout trial period;
          "N-day free trial" on dashboard cards (marketing copy static).
  - [x] **Add-ons data-driven** — `addons` table (migration 0020) seeded from constants;
        prices/grants admin-editable + **Stripe-synced** (`syncAddonPrice`); every read
        (priceForAddOn, AI/sub-tenant grants, bill lines, seat price) goes through the
        cache; admin Pricing page has an Add-ons editor. **Pricing initiative COMPLETE —
        nothing constant.**

### 6b. Carried-forward notes (from owner, drive upcoming builds)
- [x] **Plan-card feature completeness** — every card now shows the full value. Dashboard
      cards surface team seats (incl. "Unlimited") + the sub-tenant count (e.g. "10
      sub-tenants"), AI is framed as "AI assistant credits", and a shared "Every plan
      includes" footer lists the baseline (API & SDK, webhooks, audit, suppression,
      sandbox, usage-based billing). Marketing tiers align the AI-assistant wording (they
      already listed proof / dedicated IP / SSO / residency / RBAC / seats per tier).
      Gated features (proof, dedicated_ip, sso, residency, rbac) render from the plan's
      feature set. Browser-verified.
- [x] **Custom / enterprise plans + Sales CRM** — both phases shipped.
  - [x] **Phase 1 — lead capture + CRM.** `leads` + append-only `lead_notes` tables
        (migration 0021); public rate-limited + honeypot-guarded `POST /v1/leads`;
        marketing **`/contact` form** replaces the `mailto:sales@` (Enterprise CTA +
        footer link); admin **Leads** section (list with pipeline tabs/counts, detail
        with lifecycle status, claim/assign, and an activity timeline of hand-written +
        auto system notes). Staff endpoints `GET/PATCH /v1/admin/leads[/:id]` +
        `POST …/notes` (support+ role, audited). E2E test `pnpm --filter @rootmail/api
        test:leads` (22 checks) + browser-verified end-to-end.
  - [x] **Phase 2 — custom enterprise plans.** `custom_plans` table (one per org;
        migration 0022) holds bespoke economics; the org runs on the enterprise tier (all
        features) while a per-org override in the cached resolver (`planForOrg`/
        `aiCreditsForOrg`) **enforces** the custom quota/overage/seats/AI exactly as sold.
        Admin creates/edits it from the org page (superadmin, audited); save provisions a
        real Stripe product+price; **linking the originating lead converts it → won +
        linked customer**. Billing is a separate **send-invoice subscription** (honest
        enterprise model; uses the org owner's email). Deactivate reverts to standard
        enterprise. E2E test `pnpm --filter @rootmail/api test:custom-plans` (24 checks,
        incl. real test-mode Stripe sub + cleanup) + browser-verified.
- [x] **Discounts / sales surfaced across pricing** — both phases shipped.
  - [x] **Phase 1 — plan sales (admin + dashboard + honest checkout).** A plan can go
        on sale: `sale_percent_off` + `sale_ends_at` (migration 0023) synced to an
        auto-applied Stripe coupon. Admin sets/clears it from /pricing (superadmin,
        audited); the cached resolver exposes it; dashboard plan cards show the original
        struck-through + sale price + "X% off · ends …"; checkout auto-applies the coupon
        so the customer is charged the sale price (verified: amount_discount > 0). E2E
        test `pnpm --filter @rootmail/api test:pricing-sales` (18 checks) + browser-verified.
  - [x] **Phase 2 — marketing surface + add-on sales.** Public `GET /v1/pricing`
        (no auth) feeds the marketing pricing cards live, so an active sale shows
        there too (struck-through original + sale price + "X% off" badge), with a
        graceful fallback to static prices if the API is down. Add-ons can also go
        on sale (migration 0024) — charged honestly via a discounted "sale price"
        used in checkout + add-on sync (no coupon stacking with a plan sale); admin
        sets/clears it on /pricing, dashboard add-on manager shows it live. E2E test
        `test:pricing-sales` now 27 checks (plan + add-on) + browser-verified.
- [x] **Custom in-app checkout (no Stripe redirect)** — Stripe **Embedded Checkout**
      (`ui_mode: "embedded_page"`) mounts inline on `/billing/checkout` (no redirect);
      `createEmbeddedCheckout` reuses the hosted line-item / sale-coupon-or-promo / trial
      logic, so gating, discounts, trials, and grandfathering carry over. New env
      `STRIPE_PUBLISHABLE_KEY` (present in `.env`) + `@stripe/react-stripe-js`. Graceful
      fallback to the hosted redirect when the publishable key/price is absent. Plan cards
      route paid upgrades to the on-page checkout. E2E `test:embedded-checkout` (6 checks)
      + browser-verified (the Stripe payment form renders inline, TEST MODE, promo-code +
      overage line intact).
  - [x] **Configure + pay on one page.** `/billing/checkout` is now an interactive
        configurator: pick interval + toggle add-ons with a **live total**, then "Continue
        to payment" builds the embedded session from exactly that config (`createEmbeddedCheckout`
        + the endpoint take an `addons` override). Entitlements stay honest — `syncSubscription`
        **reconciles `org_addons` from the paid subscription** (`reconcileAddonsFromSubscription`),
        so add-ons chosen at checkout match what's billed. Add-ons bill monthly, so they're
        gated to monthly billing (Stripe = one interval per sub). `test:embedded-checkout`
        now 9 checks (config line items + reconcile) + browser-verified (live $28 total ==
        Stripe's "$28.00 due today").
- [x] **Comms** — dogfood rootmail for its own email.
  - [x] **Lifecycle emails** — all through the existing `sendSystemEmail` → system-mail
        queue → worker → provider pipeline (mock writes `.eml` in dev, SES in prod).
        Added content builders (`welcomeEmail`, `invitationEmail`, `paymentFailedEmail`,
        `trialEndingEmail`; user input HTML-escaped) and wired the moments: **team invite**
        now actually emails the invitee the accept link (was only returned in the API
        response), **welcome** on email verification, and Stripe-driven **payment-failed
        (dunning)** + **trial-ending** via `invoice.payment_failed` /
        `customer.subscription.trial_will_end` (owner looked up by `ownerContactForCustomer`).
        `test:comms` (10 checks) + dogfood-verified end-to-end (signup → verification `.eml`,
        invite → invitation `.eml`).
  - [x] **OAuth-signup welcome** — OAuth accounts (verified on creation, no verify step)
        now get the welcome email when `upsertOAuthUser` reports `created`.
  - [x] **Admin announcement / broadcast** — superadmin composes a subject + body on the
        admin **Announcements** page; `POST /v1/admin/announcements` fans it out to every
        verified account owner via `sendSystemEmail` (deduped, audited), with a recipient
        preview + confirm. `test:comms` now 13 checks; dogfood-verified (broadcast → owners'
        `.eml`). Follow-up: an unsubscribe flow if these ever become promotional vs.
        service notices.
- [x] **UI / dark-mode pass** — class-based dark mode shipped across all three apps:
      `.dark` palettes (dashboard reuses marketing's indigo dark; admin a monochrome
      near-black that keeps its staff character), a pre-paint no-flash theme script in
      each layout, and a ThemeToggle in each app's chrome (persists to localStorage,
      respects system preference). Browser-verified light↔dark. Ongoing visual polish is
      continuous, not a discrete item.

## Production — LIVE (deployed + tested 2026-06-24)

rootmail is **deployed and running in production** on AWS. A safe end-to-end prod probe
passed: signup → workspace + `rm_live_` key, the **AI assistant returning real Claude
responses** (`source: "claude"`, AI credits metered), live-send gating, and the SES worker.
Only **Stripe live** remains owner-blocked (still in test).

### Continuing ships (post-launch — 2026-06-29)
Built, deployed, and verified after the 2026-06-24 launch (all 5 images via CI):
- **Yearly overage, billed monthly.** Stripe forbids mixing intervals in one subscription, so
  a yearly plan can't carry the monthly metered overage item — yearly orgs now get a dedicated
  monthly metered overage sub (reconciled on plan change + lazily on first use). Also fixed a
  latent bug where `billingInterval` was never set to `"year"` in Stripe mode.
- **Multiple workspaces** (tier-gated 1→unlimited + a `+5` add-on), **native inline rename**
  (Production + Sandbox), and a guarded delete.
- **Settings → Profile** — editable display name + avatar (stored via the asset store).
- **Assistant** — content-based chat titles, inline rename, and a reworked auto-growing composer.
- **Admin CMS** — staff-managed blog + changelog (`content.publish` permission); the marketing
  site fetches published content (static fallback) and rebuilds on publish via **triggered**
  on-demand ISR (no polling). New `GET /v1/blog`, `/v1/changelog`, staff `/v1/admin/cms/*`.
- **In-app contact** — dashboard "Contact support" + a fixed Enterprise "Contact sales" path
  (it was calling the self-serve upgrade the API rejects); both file org-tagged leads into the
  admin Leads inbox, where staff provision a custom plan via the existing flow.
- **Stripe webhook** confirmed live + correct (`service.gateml.io/v1/webhooks/stripe`).

**Live over HTTPS** (gateml.io — alpha/beta; switches to rootmail.io when stable):
- `service.gateml.io` — API (nginx + certbot) · healthy: Postgres (RDS) + Redis
- `marketing.gateml.io` — marketing site
- `dashboard.gateml.io` — operator console (email/password + **GitHub OAuth** live)
- `internal.gateml.io` — staff console (first-run superadmin bootstrap on the login page)
- worker — all 6 BullMQ queues "ready" on `provider "ses"`

**Topology:** one app per EC2 host; managed **RDS** (Postgres) + **ElastiCache Redis,
cluster-mode-disabled single node** (migrated off Serverless 2026-06-24 — cheaper, no
CROSSSLOT). Per-host gitignored `.env.prod` (never committed, never baked into images).
Host IPs / SGs / the rebuild disk-dance are in the `prod-deployment` agent memory + below.

### Confirmed live
- **Data** — RDS Postgres (`rootmail` DB) + ElastiCache Redis (new node).
- **AI assistant** — Anthropic credits funded; real `claude` replies + AI-credit metering.
- **Email** — `MAIL_PROVIDER=ses`; signup fires a real verification email; customer sends
  are gated behind org-email + sending-domain verification (by design).
- **OAuth** — **GitHub sign-in works end-to-end.** Google needs one console entry (below).
- **CI** — GitHub Actions builds + pushes all 5 images to Docker Hub (below).
- **Stripe** — test mode (embedded checkout verified). Live mode pending (owner-blocked).

### Remaining owner actions (the only things left)
1. **Google OAuth** — add redirect URI `https://dashboard.gateml.io/oauth/google/callback`
   in Google Cloud Console → Credentials → your OAuth client. (GitHub is already done; the
   app sends the correct URI — verified. The middleware bug that blocked `/oauth/*` is fixed.)
2. **Delete the old ElastiCache Serverless cache** (`gateml-redis-ytrhu7`) — prod now runs on
   the new cluster-mode-disabled node; deleting it captures the cost saving.
3. **Enable CI image push** — ✅ DONE. Repo secrets are set; every push to `main` builds +
   pushes all 5 images (`.github/workflows/images.yml`). This is the live deploy path now —
   the entire post-launch batch above shipped through it.
4. **Stripe live** — set `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_PUBLISHABLE_KEY`
   (`pk_live_…`), `STRIPE_WEBHOOK_SECRET`; recreate prices (or set them from admin `/pricing`,
   which syncs to Stripe); webhook → `https://service.gateml.io/v1/webhooks/stripe`
   (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`). Then
   the **metered overage** prices + Billing Meters (`STRIPE_PRICE_OVERAGE_PRO/_SCALE` +
   `STRIPE_METER_OVERAGE_PRO/_SCALE`) — code wired + verified, activates once both are set.
5. **SES notifications** — create an SNS topic, point SES bounce/complaint/delivery at it,
   subscribe `https://service.gateml.io/v1/webhooks/ses` (auto-suppression). The API is up, so
   `SubscriptionConfirmation` auto-confirms. Set `DNS_VERIFY_MODE=live` for real sub-tenant TXT
   checks. *(Optional inbound:* `INBOUND_DOMAIN` + MX → SES inbound → SNS → inbound webhook.)
6. **Verify a real sending domain** (in SES + the dashboard) so customer `/v1/messages` sends
   leave the gate — publish DKIM CNAMEs + SPF + a DMARC TXT.
7. **Postal address** — dashboard Settings → sender address (CAN-SPAM footer on marketing/sales).
8. **Domain switch (later)** — gateml.io → rootmail.io once stable (DNS + `ROOTMAIL_DOMAIN`,
   `PUBLIC_API_URL`, `DASHBOARD_URL`, `NEXT_PUBLIC_DASHBOARD_URL`, `ROOTMAIL_API_URL`).

### How we deploy now (keep going)
- **CI builds the images** (`.github/workflows/images.yml`) on GitHub's amd64 runners and
  pushes `pachal/rootmail-<svc>:latest` (+ `:sha-…`) to Docker Hub — this sidesteps the tiny
  hosts' ENOSPC during local builds. `docker-compose.prod.yml` references those images.
- **Deploy to a host = pull + recreate (no build):**
  ```
  docker compose --env-file .env.prod -f docker-compose.prod.yml pull <svc>
  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d <svc>
  ```
  (Private repos: `docker login` once per host first.)
- **Fallback (build on the host):** `up -d --build <svc>` + the disk-dance — stop the svc →
  `docker rmi -f` the old image → `docker builder prune -af` → bump swap to 1G — or the
  ~1.4GB rebuild ENOSPCs on the 4.4GB boxes.
- **Changed `.env.prod`?** you MUST `up -d --force-recreate <svc>` — plain `restart` does not
  re-read `env_file`. (ioredis/pg auto-reconnect, so a Redis/DB endpoint swap needs no rebuild.)

### Post-deploy verification (before a public announce)
- **Do NOT run `scripts/smoke.ts` against prod** — it sends to synthetic addresses
  (`ada@example.com`, `guest@gmail.com`, …) which would hit **real SES**. Use a probe that
  only ever sends to your own inbox (as done 2026-06-24: signup + assistant + send-gating).
- After verifying a real domain, send yourself a real email; confirm SES delivery + a
  bounce/complaint round-trip lands in suppression.
- One small **live** Stripe checkout once live keys are in; confirm the webhook flips the plan
  + a `payment_failed` test triggers the dunning email.

---

## Vision — where rootmail goes after launch

The positioning holds: **"email infrastructure that scales with who's asking"** — one
core that's dead-simple for a solo dev and grows into per-tenant sub-tenancy and
legal-grade proof. Three bets compound on that, in rough priority:

1. **The AI assistant is the operating layer** *(shipped — the first vision delivered).*
   It no longer just drafts. It **builds** (templates, lists, sequences, campaigns),
   **operates** (adds contacts to lists, sends or schedules campaigns and one-off
   messages), and **diagnoses** — "why did this bounce?" now reads the message status,
   the delivery audit trail, and the suppression list, surfaces the actual SMTP bounce
   reason, and explains the fix. Every action executes through the **gated API** under
   the caller's own auth, so it inherits their plan/role/AI-credit limits and surfaces an
   upgrade at the boundary; a model call that fails before completing isn't billed, and a
   keyless install degrades to a deterministic fallback that still runs through the gated
   API. It's the headline differentiator and the natural home for AI credits.
   *Requires the owner's Anthropic account to hold credits — when it's empty the live
   model 400s and the assistant falls back to the keyless path (charging nothing).*
   Next frontier: proactive nudges (notice a deliverability dip or a stalled sequence and
   offer to act) and richer multi-step planning.

2. **Deliverability as a product, not a footnote.** Email infra is won on inbox
   placement. *Phase 1 shipped:* a **deliverability score** (0–100 + grade) computed
   server-side from real send outcomes over a window — delivery/bounce/complaint/failure
   rates against industry thresholds, low-volume confidence, the factors hurting the
   score, and concrete recommendations — scoped per workspace or per sub-tenant
   (`GET /v1/deliverability`), surfaced on a dashboard page and as an assistant tool
   (`get_deliverability`, so "how's my reputation?" works). *Phase 2 shipped:* **email-auth
   guidance** — `auditEmailAuth` reports SPF / DKIM / DMARC (with policy interpretation:
   missing → weak `p=none` → enforced) / BIMI for each sending domain, with the exact DNS
   record to publish and how to strengthen a weak setup (`GET /v1/sub-tenants/:id/auth`),
   surfaced on the sub-tenant page and as an assistant tool (`check_domain_auth`); a DMARC
   starter record now ships in the standard DNS instructions. *Still ahead (Phase 3):*
   automated IP/domain **warmup** and seed-list inbox testing — both need external
   infra/inboxes, so they're not buildable solo.

3. **Proof & compliance as the wedge no competitor has.** Layer-3 signed proof bundles
   are unique. *Phase 1 shipped:* **audit-grade compliance exports** — `GET /v1/exports/
   compliance?from=&to=` returns an Ed25519-signed bundle of every message + content hash
   + full delivery audit trail in a window ("prove exactly what we sent, signed +
   timestamped"), tamper-evident and verifiable by anyone via the existing
   `POST /v1/proof/verify` (verified: intact → valid, any edit → invalid). Enterprise-gated
   (`proof` feature); dashboard `/compliance` page generates + downloads the bundle.
   *Phase 2 shipped:* **data-retention policies** — per-workspace window (`GET`/`PUT
   /v1/retention`) that **redacts** (strips PII but keeps id + content hash + status +
   audit, so messages stay provable) or **deletes** messages past the window, enforced by a
   daily worker sweep; default-disabled (no-op until opted in), owner/admin + Enterprise,
   surfaced on the `/compliance` page. *Also shipped (2026-07-03):* the CAN-SPAM loop is
   fully self-serve — dashboard **Settings → Sender address** sets the postal address the
   footer injector uses, and bulk mail carries **RFC 8058 one-click unsubscribe** headers
   (`List-Unsubscribe` + `List-Unsubscribe-Post`, `POST /v1/unsubscribe` acts immediately
   on the signed token). *Still ahead (IN PROGRESS — the active build):* SSO / SAML / SCIM
   and data residency (already plan features) into a real enterprise tier + a SOC 2 path —
   the Sales CRM + custom plans already shipped are the GTM rails for it. (True multi-region
   residency infra and IP warm-up pools remain owner-infra items.)

**Supporting bets:** a customer-facing **analytics layer** — *shipped:* the sent →
delivered → opened → clicked **engagement funnel** with rates, a daily send series, and
top templates (`GET /v1/analytics`, dashboard `/analytics`, assistant `get_analytics`);
*shipped (2026-07-02):* **per-campaign and per-sequence breakdowns** — `GET /v1/campaigns/:id/
analytics` + `/v1/sequences/:id/analytics` (funnel + per-step drop-off), surfaced on the
campaign detail page and the sequence Engagement card, covered by the SDK. Plus
**migration on-ramps** — *shipped:* bulk **suppression** + **contacts** import
(`POST /v1/imports/suppressions|contacts`, dashboard `/import`) that maps any provider's
CSV export (SendGrid/Postmark/Mailgun) — normalizes bounce/spam/unsubscribe reasons,
dedupes, and deliberately skips sequence triggers so migrated contacts aren't
auto-enrolled; *shipped (2026-07-03):* the import page takes a **drag-in .csv file
upload** (not just paste), and **template import** — upload/paste any HTML file at
`/templates/import` (live preview, auto name/slug/subject; Handlebars placeholders carry
over from SendGrid unchanged). And **developer love** — *shipped:* the `@rootmail/node`
SDK now covers the full surface (deliverability, analytics incl. per-entity, compliance
export, retention, imports, domain-auth, assistant) and a new `@rootmail/cli`
(`rootmail send|messages|deliverability|analytics|domains:auth|import:*|assistant`, reads
`ROOTMAIL_API_KEY`) for terminal/CI use; *shipped (2026-07-03):* the hosted **test
inbox** — every sandbox send lands on the dashboard's `/test-inbox` with full rendered
content (`GET /v1/messages?sandbox=true`), no real mailbox needed; *still ahead* —
Python/Go SDKs.

**Shipped:** a one-click **unsubscribe flow** for admin announcements — every broadcast
carries a signed opt-out link (`GET /v1/announcements/unsubscribe`, confirm-step page),
the opt-out is stored per-user (`users.announcement_opt_out_at`) and excluded from future
broadcasts; essential account/security mail is unaffected. The **in-app preference toggle**
also shipped (dashboard Settings → Security → email preferences → `POST /v1/auth/preferences`),
so opting out no longer needs the email link.
**Queued near-term:** continuous visual refinement.

---

## Already built & verified (condensed history)

- **Identity/Sending + sub-tenancy** (Layer 1); **threads/inbound/inbox** (Layer 2);
  **Ed25519 proof bundles** (Layer 3).
- **SES** outbound provider (live send verified); SNS-verified bounce/complaint/
  delivery → suppression; inbound parse via `Reply-To` token (owner SNS wiring pending).
- **Auth:** verification, password reset, TOTP MFA (+ recovery), login/MFA lockout,
  verified-send gate, OAuth scaffold (Google/GitHub/Apple, inert until creds);
  dashboard auth UI.
- **Dashboard UX:** onboarding, ⌘K palette, toasts, role-picker, asset library,
  webhook console + delivery log, loading/error boundaries.
- **Marketing:** home (hero/layers/features/sub-tenancy/FAQ/CTA), `/docs`, `/pricing`,
  `/legal/*`, SEO/sitemap — *content accuracy is workstream 1*.
- **Billing:** plans/seats/add-ons/yearly, tier-gating → 402, Stripe (test) verified.
- **Compliance:** CAN-SPAM footer (marketing/sales, pre-content-hash) + GDPR
  export/delete.
- **Hardening:** `SECURITY.md` (no IDOR, RBAC, SSRF, signed idempotent webhooks);
  smoke 27 checks; per-IP signup cap.
- **SDK:** `@rootmail/node` — messages/sub-tenants/templates/sequences/lists/
  campaigns/threads/proof.
- **Admin (`apps/admin`):** staff auth + cross-org API; directory + org detail;
  support inspection (sends + audit + proof); audited one-time-code impersonation.
- **Infra:** CI, Dockerfiles, `DEPLOY.md`.
