# Security posture

A summary of rootmail's security model and the controls in place, from the Phase 6
hardening review. (For reporting a vulnerability, email security@rootmail.io.)

## Authentication
- **Two credential types, hash-only at rest.** API keys (`rm_live_…` / `rm_test_…`)
  and dashboard session tokens (`rms_…`) are stored only as SHA-256 hashes; the raw
  value is shown once and never persisted. Passwords use scrypt (`scrypt$salt$hash`).
- **MFA (TOTP, RFC 6238).** Optional per-user; enrollment requires confirming a code,
  issues 10 single-use recovery codes (scrypt-hashed), and login returns a short-lived
  signed challenge before a session is minted.
- **Brute-force controls.** Per-identity login lockout (10 failures → 429 for 15 min,
  on `/login` and `/mfa/verify`) and a per-IP sign-up cap (10/hour).
- **Public surface is explicit.** Only `/health`, `/v1/webhooks/*`, `/v1/auth/*`,
  `/v1/unsubscribe`, `/assets/*`, `/v1/proof/*` skip auth; everything else requires a
  valid key or session.

## Authorization
- **RBAC permission matrix** enforced on every mutating route via `requirePermission`
  (e.g. `messages.send`, `content.manage`, `webhooks.manage`, `members.manage`,
  `billing.manage`, `apikeys.manage`, `proof.read`). API keys act as the account and
  resolve to all permissions; session users resolve to their role (incl. custom roles).
- **Plan/feature gating.** Gated capabilities (sub-tenants, sequences, campaigns,
  threads, RBAC, proof) return `402 feature_locked` with an upgrade payload. The
  sub-tenant send path re-checks the feature so a downgraded org can't keep sending.
- **No IDOR.** Every resource lookup by id is scoped to the caller's workspace or org
  (`where(and(eq(table.id, id), eq(table.workspaceId | organizationId, …)))`); mutations
  operate only on entities already loaded through that scoped check. Audited Phase 6.
- **First-send gate.** Live sends require the org owner's email to be verified.

## Input, SSRF, and webhooks
- **All request bodies are validated** with Zod (`parse()` helper) before use.
- **Outbound dev webhooks are SSRF-guarded** — target URLs are checked against
  loopback/private ranges (`assertPublicUrl`); a dev-only `WEBHOOK_ALLOW_LOCAL` escape
  hatch exists for local catchers and must stay off in production.
- **Inbound webhooks are signature-verified.** Stripe via `constructEvent`; Amazon SNS
  via message-signature verification with an SSRF-guarded signing-cert host check. Both
  are idempotent (event ids / SNS MessageId deduped).

## Email safety
- **Test-mode sends never reach a real ESP** — they route to the mock provider, so
  synthetic recipients can't bounce the production sending domain.
- **DKIM/SPF/DMARC** on the sending domain; bounces/complaints feed suppression.
- Outbound webhook payloads carry ids/status only — no message content.

## Secrets & data
- Secrets live in gitignored `.env` / `apps/dashboard/.env.local`; `.env.example` is
  placeholders only (committed). The dashboard holds the API key in an httpOnly cookie
  and only ever calls the API server-side.
- **Layer-3 proof bundles** are Ed25519-signed and pin a `content_hash` of the rendered
  HTML, so a message's lifecycle is independently verifiable.

## Rate limiting
- Global limit (300/min per key/IP) + tighter per-route caps on the AI endpoints, plus
  the auth lockout and sign-up cap above.

## Abuse & billing integrity
- **Quota is atomic and per-organization.** Monthly send usage is counted per org,
  not per workspace, so spinning up extra workspaces or sub-tenants can't multiply a
  plan's allowance. Free is hard-capped: the cap is reserved in a single conditional
  `UPDATE … WHERE emails_sent + n <= quota`, so a burst of concurrent sends can't
  overshoot it (regression test: `apps/api/scripts/test-quota.ts`,
  `pnpm --filter @rootmail/api test:quota`). An `idempotency_key` replay short-circuits
  before it counts; a concurrent duplicate that loses the insert race refunds its
  reservation, so retries never over-count.
- **Self-upgrade is fail-closed.** In Stripe mode a plan change applies only after a
  real Checkout session is created — a misconfigured price or a Stripe outage returns
  an error instead of silently granting a free upgrade. The direct `POST /v1/billing/plan`
  switch is rejected in Stripe mode. Paid add-ons (extra seats, dedicated IP, sub-tenant
  packs, AI-credit packs) are also refused via self-serve in Stripe mode until
  subscription-item billing is wired, so they can't be self-granted for free.
- **AI spend is capped and cost-aligned.** AI drafts and the assistant meter against the
  plan's AI-credit allowance (plus purchased packs), rate-limited (20/min and 10/min);
  over-allowance calls return `402`. Credits bill **per model call** (1 per token-bounded
  call: a draft = 1; an agentic assistant run = 1 per step, capped at 6), so a heavier
  request costs proportionally more — never the same flat rate regardless of work done.
  Output is capped (`max_tokens`) and input is length-limited, so each call's cost is
  bounded and a credit always covers it.
- **Test mode can't send real mail or consume quota** — sandbox sends route to the mock
  provider and are never metered.

## Known follow-ups / blocked
- **Overage metering to Stripe** — wired (add-on subscription items live-verified;
  overage reported via the Billing Meter, delta-tracked). Activation per plan needs
  the overage prices recreated as recurring metered + their meter `event_name`s set
  (see ROADMAP "Blocked on you"). High-volume paid sends bill rather than block (by
  design).
- Minor: the AI-credit check is read-then-record (not atomic like the send quota); the
  per-route rate limits + the 6-call cap bound any boundary overshoot.
- A dedicated dependency/secret-scanning step in CI.
- Full accessibility/UX audit (workstream 2.3).
