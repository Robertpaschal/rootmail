# rootmail — Plan of Action (launch roadmap)

A living, phased plan from "feature-complete backend" to "launched product."
Each phase is a branch → PR; **commit at every checkpoint (◇)** so progress is
always on GitHub and reviewable. Check boxes off as we land them.

> Status legend: `[ ]` todo · `[~]` in progress · `[x]` done
> Last updated: 2026-06-16

---

## Where we are (snapshot)

**Built & on `main`:** identity/sending, sub-tenancy, threads/inbox, templates
(no-code TipTap editor + AI + uploads), sequences, campaigns/lists, seats/add-ons/
yearly billing, RBAC, Layer-3 proof bundles, dev webhooks, agentic AI assistant —
all tier-gated, smoke 14/14.

**Live services activated (2026-06-16):**
- ✅ Stripe (test mode) — all 8 price IDs verified against the API; `BILLING_MODE=stripe`.
- ✅ Anthropic — real Claude for AI drafts + assistant (`claude-opus-4-8`).
- ✅ Proof signing — real Ed25519 key.
- ✅ Sending identity → `gateml.io` (selector `gateml`) for testing.

**Decisions locked:**
- **Auth: first-party, no Firebase.** Build the Firebase-equivalent advantages
  ourselves (email verification, password reset, MFA, more OAuth providers).
- **Email provider: Amazon SES** (over SendGrid).
- **Admin app: separate `apps/admin`** (security isolation), not a dashboard section.

**Guiding principles:** unblock progressively · fail-soft (every external dep has a
local fallback) · dogfood our own email for transactional sends · keep it modular
(bounded packages, no microservices) · everything stays tier-gated.

---

## Phase 0 — Hygiene & quick unblocks  *(small, immediate)*

**Goal:** clear security debt, knock out the most self-contained mock (S3), and
kick off the items with external lead time.

- [ ] **0.1 Rotate exposed secrets** *(you)* — AWS key was in a tracked file +
      this chat. Rotate the IAM key; ideally cycle the Stripe test + Anthropic keys.
- [x] **0.2 S3 asset storage driver** — added `@aws-sdk/client-s3`, implemented
      the storage interface for S3 (`ASSET_S3_BUCKET`), local-disk driver stays
      the default/fallback. Verified a real put→get round-trip against
      `rootmail-storage-bucket`. (Note: upload IAM is least-privilege Put/Get;
      add `s3:DeleteObject` when asset deletion ships.)
  - ◇ **Checkpoint:** commit `feat: S3 asset storage driver` + this roadmap. ✅
- [ ] **0.3 Kick off SES (external latency — start now)** — verify the `gateml.io`
      domain identity in SES (us-east-1), publish DKIM/SPF/DMARC DNS, and
      **submit the production-access request to exit the SES sandbox** (approval
      can take ~24h; in sandbox you can only send to verified addresses).

**Need from you:** DNS/registrar access for `gateml.io`; confirm the SES region
is `us-east-1`; a verified test recipient address for sandbox-era sends.

---

## Phase 1 — Real email via SES  *(Track A2 — biggest functional gap)*

**Goal:** replace the mock provider with real outbound + the inbound/feedback loop.

- [x] **1.1 SES send path** — `@aws-sdk/client-sesv2`, `SesProvider` (Simple
      content API), `MAIL_PROVIDER` enum → `mock|ses|sendgrid`, registered in the
      provider router. Test-mode ("sandbox") sends route to mock so synthetic
      recipients never bounce the production domain. Pipeline no longer fakes
      "delivered" for real providers (waits for async webhooks, 1.5).
- [x] **1.2 Domain auth** — **Easy DKIM** on `gateml.io` (SES-managed); SES signs
      automatically. (BYODKIM with our `gateml` selector remains an option.)
      SPF/DMARC published by owner. Sub-tenant domains need their own SES identity
      (follow-up).
- [x] **1.3 Real send verified** — sent a live email to a real inbox via SES
      (message id returned). `.env` stays `MAIL_PROVIDER=mock` by default so the
      synthetic-recipient smoke can't bounce SES; flip to `ses` for live sends.
  - ◇ **Checkpoint:** `feat: SES outbound provider (send path live)`. ✅
- [x] **1.5 Bounce/complaint/delivery feedback** — `POST /v1/webhooks/ses`
      (public, SNS-signature-verified, SSRF-guarded cert fetch, auto-confirms
      subscriptions, Redis-deduped). Maps `mail.messageId` → our
      `providerMessageId`; permanent bounce + complaint → suppression + status,
      delivery → status; audits + fires outbound webhooks. Parsing/classification
      unit-verified. Full e2e needs SNS wired (owner: SES config set → SNS topic →
      this endpoint via ngrok/deploy).
  - ◇ **Checkpoint:** `feat: SES bounce/complaint/delivery webhook → suppression`. ✅
- [x] **1.4 Inbound parse** — chosen: **dedicated subdomain** + **Reply-To token**.
      Outbound thread sends set `Reply-To: reply+<threadId>@<INBOUND_DOMAIN>`; the
      SES webhook handles `notificationType:"Received"`, extracts the thread id,
      parses the MIME (`mailparser`), appends the inbound message, fires
      `message.received`, and exits reply-triggered sequences. Token extraction +
      MIME parse unit-verified. Owner setup: MX of `reply.gateml.io` → SES inbound,
      a receipt rule with an SNS action → `/v1/webhooks/ses`, then set
      `INBOUND_DOMAIN=reply.gateml.io`. (Reply-route/campaign sends can adopt the
      token helper later; S3-action path for >150KB mail is a follow-up.)
- [ ] **1.6 Deliverability basics** — bounce/complaint-rate monitoring hooks;
      List-Unsubscribe header (also Phase 5 CAN-SPAM); IP warm-up → Phase 8.

**Need from you:** confirm whether to use a dedicated IP or shared SES IP for now.

---

## Phase 2 — Complete first-party auth  *(the locked decision)*

**Goal:** finish the auth system that already has signup/login/sessions/OAuth-scaffold.

- [x] **Shared system-mailer** — `sendSystemEmail()` enqueues to a dedicated
      `rootmail-system-mail` queue; the worker delivers via the configured provider
      (no customer workspace, no quota, durable retries). Providers stayed in the
      worker — no cross-package move needed.
- [x] **2.1 Email verification flow** — `auth_tokens` (single-use, hashed), signup
      sends a verification email (dogfoods the pipeline), `POST /v1/auth/verify-email`
      sets `email_verified_at`, `…/resend`. e2e-verified (signup→email→verify→login).
- [x] **2.2 Gate live sends on verification** — `assertEmailVerified(org)` blocks
      live sends (single, thread reply, campaign launch) from an org whose owner
      hasn't verified their email → 403; test-mode sends unaffected. Keyed on the org
      owner, so it applies to API-key and session sends alike. e2e-verified.
- [x] **2.3 Password reset** — `POST /v1/auth/forgot-password` (no email enumeration)
      + `…/reset-password` (1h single-use token, rehash, invalidates all sessions).
      e2e-verified (forgot→email→reset→old-rejected→new-works).
- [x] **2.4 MFA (TOTP)** — core TOTP (RFC 6238, dependency-free, verified against
      the RFC vectors), enrollment (secret + otpauth URI), activate, 10 single-use
      recovery codes, signed login challenge, verify, disable. API-complete and
      e2e-verified against a live server; dashboard enroll/QR UI is a follow-up.
  - ◇ **Checkpoint:** `feat: TOTP MFA`. ✅
- [x] **2.5 Auth hardening — lockout** — per-identity Redis failure counter; 10
      failed password attempts (or MFA codes) → 429 for 15 min, cleared on success.
      Covers `/login` (by email) + `/mfa/verify` (by user). e2e-verified. (Session
      rotation / cookie review tracked separately.)
- [ ] **2.6 OAuth providers** — add Apple to the registry; light up Google/GitHub
      when you supply creds (already wired). Buttons appear automatically.
  - ◇ **Checkpoint:** `feat: auth hardening + Apple OAuth`.

**Need from you:** Google/GitHub/Apple OAuth app credentials (when ready).

---

## Phase 3 — Dashboard UX pass  *(Track A3 — "make its case")*

- [ ] First-run onboarding checklist; starter template on signup.
- [ ] Polished empty / loading / error states everywhere.
- [ ] Consistent feature-locked → upgrade CTAs.
- [ ] Invite **role-picker** (RBAC assignment is API-only today).
- [ ] Asset library UI · webhook-delivery log UI · richer sequence/campaign/
      enrollment views.
- [ ] Global search / command-K · keyboard shortcuts · toasts.
- [ ] Mobile responsiveness + a11y.
  - ◇ **Checkpoints:** one per coherent group (onboarding, states, RBAC UI, nav).

---

## Phase 4 — Marketing site  *(Track A4)*

- [ ] Hero + sharpened value prop; the Layer 1/2/3 story.
- [ ] Per-feature pages (sequences, campaigns, sub-tenancy, proof, AI).
- [ ] Pricing clarity (aligned to constants) + interactive plan compare.
- [ ] Quickstart / docs + live code samples; social proof / FAQ.
- [ ] SEO/OG meta; legal (Terms / Privacy / DPA); signup→dashboard funnel.
  - ◇ **Checkpoints:** per section.

---

## Phase 5 — Billing completion + loose ends  *(Track A5)*

- [ ] **5.1 Overage metered billing** — create per-plan Stripe usage prices
      (`STRIPE_PRICE_OVERAGE_PRO` $0.85, `STRIPE_PRICE_OVERAGE_SCALE` $0.70, 1 unit
      = 1,000 emails), report usage records, reconcile with the in-app meter.
- [ ] **5.2 Sub-tenant downgrade guard** — block sends through sub-tenants when a
      plan loses the feature.
- [ ] **5.3 Permission-coverage audit** — every mutation checks a permission.
- [ ] **5.4 CAN-SPAM / GDPR** — physical address in footer, data export + delete.
- [ ] **5.5 New-account abuse limits** — rate caps + the email-verification gate (2.2).
- [ ] **5.6 SDK parity** — `@rootmail/node` covers the new endpoints.
  - ◇ **Checkpoints:** per item.

---

## Phase 6 — Hardening + tests  *(Track A6)*

- [ ] Security review of the whole gated surface (authz on every route).
- [ ] Expand `scripts/smoke.ts` → broader e2e.
- [ ] Fix/route-around the dashboard **preview-cookie gotcha** so write-flows are
      testable in CI.
  - ◇ **Checkpoint:** `chore: e2e + security pass`.

---

## Phase 7 — Internal admin app  *(Track B — after consumer side is solid)*

New `apps/admin` — separate staff auth (not customer sessions) over an
admin-scoped, cross-org API. CRM-shaped.

- [ ] Staff auth + staff RBAC; admin API surface; new tables (staff users, leads,
      deals, coupons, internal notes).
- [ ] CRM — users/orgs directory, profiles, activity, **impersonate** for support.
- [ ] Billing ops — Stripe subscriptions view, credits/overrides/refunds/comps, dunning.
- [ ] Pricing management — make plans/add-ons/AI-credits **data-driven** + Stripe-synced.
- [ ] Promotions — coupons, trials, discounts.
- [ ] Comms — dogfood rootmail for announcements/lifecycle.
- [ ] Sales — leads, deals, enterprise/custom-pricing quotes, pipeline.
- [ ] Support tooling — inspect a customer's sends/audit/proof; suppression mgmt.
- [ ] Analytics — revenue, churn, usage, deliverability, AI-credit consumption.
  - ◇ **Checkpoints:** per module.

---

## Phase 8 — Infra & launch ops  *(Track C — overlaps A)*

- [ ] Deploy api/worker/dashboards; **managed Postgres/Redis** — wire RDS
      (`rootmail.culya0sie5af...`, needs master user + db + `sslmode`) + ElastiCache
      (`gateml-redis-ytrhu7...`, VPC-only) **from inside the VPC**.
- [ ] CI/CD + prod migrations + secrets management.
- [ ] Observability (logs/metrics/alerts) + queue monitoring; backups; status page.
- [ ] Domain + email DNS (prod `rootmail.io`); OpenAPI/SDK docs + changelog; load tests.
  - ◇ **Checkpoints:** per area.

---

## Sequencing & parallelism

```
0 ─▶ 1 ─▶ 2 ──▶ 3 ─▶ 4 ─▶ 5 ─▶ 6 ─▶ 7 ─▶ 8
└ 0.3 (SES verify/sandbox) runs in background during 0–1
   3, 4, and parts of 8 can overlap once 1+2 land
```

`A1` (activation) is essentially done. The critical path to a real launch is
**1 (email) → 2 (auth) → 5 (billing honesty) → 6 (harden)**; 3/4 make it sell;
7 is post-consumer; 8 is when we leave the laptop.

## Inputs needed from you (running list)
- [ ] Rotate the AWS key (0.1).
- [ ] DNS access for `gateml.io` + confirm SES region (0.3 / 1.2).
- [ ] OAuth app creds: Google, GitHub, Apple (2.6).
- [ ] `STRIPE_WEBHOOK_SECRET` via `stripe listen` when we test billing webhooks.
- [ ] RDS master username + db name; VPC/bastion plan for Phase 8.
