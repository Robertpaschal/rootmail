# Supabase email adapter — implementation foundation

**Unreleased, private, and not connected to sending. Do not enable this as a
production Supabase hook yet.** This increment prepares authenticated email
plans in memory; it does not call Rootmail, return hook success, or create a
Supabase session. The ordinary Rootmail send endpoint currently retains bodies
and conversation copies. Sending auth secrets through it is not this adapter's
supported integration path.

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

The tests use an independent HMAC signer with synthetic secrets and recipients.
They do not import Rootmail environment, database, queue or provider code. The
workspace's existing unit-test job discovers this package through Turbo.

`createSupabaseEmailPlanner(config)` returns a function accepting unmodified
request text and `Headers` (or a header record). Its result has `messages`, each
with a stable `idempotencyKey` and explicit `readSensitiveContent()` accessor.
Keep this module server-side. Do not serialize plans into application logs,
tracing/APM, request recordings, databases or Notion, even though common accidental
inspection paths are redacted. Do not use production payloads as test fixtures.

### What these tests do not prove

Stable keys are **not exactly-once delivery**. No HTTP transport, durable replay
ledger, concurrent duplicate admission, partial-send recovery, tenant-key
authorization, provider failure/timeout handling or content expiry is implemented
here. A signature timestamp is an anti-replay window, not the code's issuance or
expiry time. Never derive a fresh TTL on every retry.

## Planned setup, rotation and rollback

This is a checklist for the next increment, **not a deployable customer guide**:

1. Implement and test the auth-only Rootmail content/expiry contract before
   adding a network transport. It must fail closed against servers lacking it;
   do not send invented privacy fields to `/v1/messages` (unknown fields are
   currently stripped, not enforced).
2. Configure one customer's project, workspace/client-scoped key, verified
   sender, branding, callback allowlist and secure-email-change setting.
   Keep both keys in the server secret store; never in browser/native bundles.
   Current client-scoped Rootmail keys are not endpoint-limited send-only keys.
3. Add a raw-body HTTPS hook wrapper, stream size/time limits, safe status mapping
   and a total request deadline within Supabase's budget. No raw request/response
   logging. Disable platform JWT checks only on that hook route, and enforce the
   webhook signature there instead. Do not disable application authentication.
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

Configs touched: this private package's manifest/TypeScript config and the
workspace lockfile. Prod behaviour preserved: no running app imports this package;
no send, queue, database, tracking, provider, IAM, DNS or Supabase setting changed.
