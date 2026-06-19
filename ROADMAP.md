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
- [ ] _Minor residual:_ AI-credit check is read-then-record (rate-limit-bounded), not
      yet atomic like the send quota.

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
- [ ] Billing ops UI (admin Stripe subscription view + credits/comps/refunds/dunning).
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
- [ ] Stripe **overage**: the `STRIPE_PRICE_OVERAGE_PRO/_SCALE` you created are
      `type=one_time` — recreate them as **recurring usage-based (metered)** prices
      ($0.85 / $0.70 per unit = 1,000 emails), each backed by a **Billing Meter**,
      then set `STRIPE_METER_OVERAGE_PRO/_SCALE` to the meters' `event_name`. The
      code is wired + verified; it activates per-plan once both are set. (Add-on
      subscription-item billing is already wired + live-verified.)
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
