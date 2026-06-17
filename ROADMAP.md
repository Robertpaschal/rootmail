# rootmail — Roadmap & Plan of Action

The single source of truth for **what's built** and **what's next**. Supersedes
the old phased roadmap and the separate product-audit POA (both folded in here).

> **How we work:** every item is a branch → PR, committed at each checkpoint (◇).
> Each item is **independent, complete, and verified** before it's checked off —
> no TODOs left behind, no placeholders, real copy/links/values, tests where
> behaviour can regress. **Truthful by default:** if we say it, the code does it.
> Status: `[ ]` todo · `[~]` in progress · `[x]` done. Updated 2026-06-17.

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

**Apps:** `api` (Fastify) · `worker` (BullMQ) · `marketing` (Next) · `dashboard`
(Next) · `admin` (Next). **Live services:** Stripe (test), Anthropic
(`claude-opus-4-8`), SES send path, Ed25519 proof signing.

**The work now is not "more features" — it's making the product _honest, polished,
abuse-proof, and deployed_.** That's the plan below.

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
- [ ] **2.3 Broader UX pass** — marketing → dashboard → admin: spacing, states,
      mobile, and a focused **a11y** sweep (aria-labels on icon-only buttons, focus
      order, contrast). _(remaining)_

### 3. Anti-abuse hardening — "can't game it" *(mostly no deps)*
Threat-model **price · service · product**; each gap a fix + a test.
- [ ] **3.1 Billing integrity** — quota can't be bypassed via workspaces /
      sub-tenants / test-mode / idempotency replay; add-on quantity + seat changes
      validated server-side; **overage** either metered to Stripe (needs prices,
      below) or hard-capped so paid overage isn't free.
- [ ] **3.2 Plan-boundary integrity** — downgrade with over-limit sub-tenants/seats;
      402 gates on every gated route; re-verify the permission matrix post-admin.
- [ ] **3.3 Abuse limits** — per-IP signup cap, unverified send-gate (both key +
      session), disposable-domain handling, login/MFA lockout — re-confirm w/ tests.
- [ ] **3.4 Service abuse** — per-key/session rate limits, sub-tenant verification
      can't be spoofed, webhook SSRF, proof tamper-resistance, impersonation audit.
  - ◇ a documented threat list with a passing test per mitigation.

### 4. Auth & no-seed operability
- [ ] **4.1** Confirm + lock session-only sign-in (no key-login anywhere); document
      keys as API-only; polish multiple-API-keys UX (name/list/revoke/last-used).
- [ ] **4.2 Social signups** — make Google/GitHub/Apple work when creds present;
      cleanly hide/disable the buttons when unconfigured (no dead buttons).
- [ ] **4.3 No-seed** — real users self-provision on signup already; add a self-serve
      **staff bootstrap** for `apps/admin` (guarded first-run / env superadmin /
      `create-staff` script) so nothing needs `pnpm db:seed`. Migrations stay the
      only required setup.

### 5. API / SDK / docs contract
- [ ] **5.1** SDK parity for every public endpoint; consistent error shapes +
      snake/camel mapping; `scripts/smoke.ts` covers the full surface.
- [ ] **5.2** (Optional) generate OpenAPI as the single source for the API reference.

### 6. Admin console — remaining modules *(Phase 7 cont.)*
- [ ] Analytics (revenue/usage/deliverability/AI-credit) — read-only, low-risk.
- [ ] Suppression management (view/clear a customer's suppressions).
- [ ] Billing ops (Stripe subscription view + credits/comps/refunds/dunning).
- [ ] Pricing management — plans/add-ons/AI-credits **data-driven** + Stripe-synced.
- [ ] Promotions (coupons/trials/discounts) · Comms (dogfood lifecycle) ·
      Sales CRM (leads/deals/pipeline). New tables as each lands.

### 7. Deploy & launch ops *(Phase 8 — blocked on infra access)*
- [x] CI (typecheck + build + e2e smoke on PG/Redis services), api/worker
      Dockerfiles, `DEPLOY.md`.
- [ ] Deploy api/worker/dashboards; wire managed Postgres/Redis **in-VPC**; prod
      secrets manager; observability + queue monitoring; backups; status page;
      prod DNS for `rootmail.io`; load tests.

---

## Blocked on you (inputs)
- [ ] OAuth app credentials — Google, GitHub, Apple (→ 4.2).
- [ ] Stripe **overage** usage prices: `STRIPE_PRICE_OVERAGE_PRO` ($0.85/1k),
      `STRIPE_PRICE_OVERAGE_SCALE` ($0.70/1k) (→ 3.1 overage metering).
- [ ] SES: exit sandbox (prod-access) + confirm region; prod sending DNS.
- [ ] Infra: RDS master user + db + `sslmode`; ElastiCache reachable in-VPC; bastion/VPC plan.
- [ ] Postal address value (Settings) for the CAN-SPAM footer.

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
