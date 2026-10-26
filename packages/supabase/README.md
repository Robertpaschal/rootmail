# Supabase email adapter — unreleased reference

**Unreleased and private. Do not enable this as a production Supabase hook yet.**
The package now includes both a transport-free planner and an opt-in Web Request
handler that uses the auth-only Rootmail HTTPS endpoint. No running application
installs it automatically. Local transport tests use fake delivery; no real
Supabase session has been completed. Never use ordinary `/v1/messages` for codes.

Update: the draft branch now includes a separate, disabled-by-default
`POST /v1/auth-messages` server contract. It has encrypted ephemeral content,
expiry enforcement and a restricted SES path with tracking checks. This planner
now has an explicit HTTP wrapper, capability preflight and PostgreSQL replay
ledger. See the [customer setup reference](../../docs/supabase-hook-setup.md) and
integration notes for rollout gates and remaining limitations.

Tracking task: [Supabase authentication emails — Sprout pilot](https://app.notion.com/p/4032db0e8691818496f5c235840c351c).
Release gates and implementation sequence: [integration notes](../../docs/supabase-auth-integration.md).

## Implemented

- Standard Webhooks verification using the pinned upstream library, on the exact
  raw body before JSON parsing; timestamp checks and bounded input size.
- One current and optionally one previous signing secret for rotation. Accepts
  Supabase's `v1,whsec_…` and Standard Webhooks' `whsec_…` forms; requires at least
  32 decoded key bytes.
- Server-configured project, workspace, optional client, sender, branding and
  exact callback allowlist. Signed user metadata cannot select these values.
- Recipient-specific idempotency keys, stable across re-signed retries. The
  key includes project/workspace/client scope, event ID, action and recipient
  role/address, but no OTP, token hash, body digest or timestamp.
- Explicit action matrix and safe fixed errors, with no raw validation errors
  or library exception causes crossing the boundary.
- Redacted default JSON/string/Node inspection of prepared email objects.
  Explicit content access remains sensitive; never log or persist that result.

## Action matrix

| Supabase action | Recipients | Credentials used |
| --- | --- | --- |
| `signup` | `user.email` | `token`, `token_hash` |
| `magiclink` | `user.email` | `token`, `token_hash` |
| `recovery` | `user.email` | `token`, `token_hash` |
| `invite` | `user.email` | `token`, `token_hash` |
| `reauthentication` | `user.email` | Code only; no verification link |
| `email_change`, secure mode | Current and new address | Current: `token` + **`token_hash_new`**; new: `token_new` + **`token_hash`** |
| `email_change`, single mode | `user.new_email` only | Exactly one of `token`/`token_new`, plus `token_hash` |

The explicit `emailChangeMode` must match the Supabase project. Missing halves
of a secure change are rejected before a plan is returned. Other notification
actions are rejected until deliberately implemented. Supabase issues and verifies
credentials; this package never mints a token or declares a session valid.

For link actions the verification host comes from trusted `supabaseUrl`, never
payload `site_url`. `redirect_to` must exactly match a server allowlist entry;
an absent/empty value uses the configured default. Explicit native-app callbacks
are supported as strings, but native app session completion is not tested here.
Plain HTTP callbacks are deliberately not supported in this first increment.

## Local development (synthetic fixtures only)

```sh
pnpm --filter @rootmail/supabase typecheck
pnpm --filter @rootmail/supabase test
```

Package tests use an independent HMAC signer, synthetic secrets, a fake ledger and
injected fetch; they never make real network/mail calls. Separate API tests use
the real local database, queue, worker and PostgreSQL ledger with fake delivery.
Turbo discovers both suites.

`createSupabaseEmailPlanner(config)` returns a function accepting unmodified
request text and `Headers` (or a header record). Its result has `messages`, each
with a stable `idempotencyKey` and explicit `readSensitiveContent()` accessor.
Keep this module server-side. Do not serialize plans into application logs,
tracing/APM, request recordings, databases or Notion, even though common accidental
inspection paths are redacted. Do not use production payloads as test fixtures.

### What these tests do not prove

Stable keys are **not exactly-once delivery**. The HTTP wrapper tests now cover
partial-recipient retry, lost responses, bounded upload/network/ledger work,
tenant/contract verification and provider-acceptance polling. These are not live
latency or Supabase/native-session evidence. A signature timestamp is not proof
of code issuance. The frozen first-event deadline reserves five minutes from the
configured 10–60 minute OTP lifetime; it does not prove a code remains valid after
a resend or before a delayed first observation. Never renew TTL on retry.

## Setup, rotation and rollback

Use the [setup reference](../../docs/supabase-hook-setup.md) only after its release
gates pass. No production hook is configured by this branch:

1. Review and validate the auth-only Rootmail content/expiry contract. The
   transport preflights policy/provider/workspace/client before posting secrets;
   do not send invented privacy fields to `/v1/messages` (unknown fields are
   currently stripped, not enforced).
2. Configure one customer's project, workspace/client-scoped key, verified
   sender, branding, callback allowlist and secure-email-change setting.
   Keep both keys in the server secret store; never in browser/native bundles.
   Current client-scoped Rootmail keys are not endpoint-limited send-only keys.
3. Mount `createSupabaseEmailHook` on one raw-body HTTPS route with the durable
   ledger. Its shared 4.5-second budget includes streaming, verification, database
   work and both recipients. It polls queued work and only acknowledges observed
   SES acceptance for every recipient. Never log request/response bodies. Exempt
   only this hook route from user-session/JWT middleware; keep signature checking.
4. Test confirmed recipients and failure paths using mocks first. Separately
   authorize a real Sprout sign-in and verify delivery and native session.
5. Only after those gates: record existing Supabase email settings, enable the
   hook on a test project, then perform the controlled customer cutover.

Rotate hook secrets with a short two-key overlap, exercise both, then remove the
old secret and confirm rejection. Future API-key rotation must exercise the new
key before revoking the old one; revocation must fail safely rather than fall back
to a different workspace/provider. Never put either secret in a ticket.

Rollback will disable the Send Email Hook and restore the previously tested
Supabase email configuration. Disabling a hook is not proof that the fallback
SMTP provider can send; verify that independently before rollout. This increment
has changed no Supabase setting, so no external rollback is currently necessary.

## References

- [Supabase Send Email Hook and email-change mapping](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase hook errors and time budget](https://supabase.com/docs/guides/auth/auth-hooks)
- [Standard Webhooks implementation](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript)

Configs touched: package metadata; reference customer-ledger SQL; disabled server
settings and migrations 0083/0084; CI-only vault fixture. Prod behaviour preserved:
no running app mounts this hook and auth remains off by default. No production
deployment, migration, environment, IAM, DNS or Supabase setting was changed.
