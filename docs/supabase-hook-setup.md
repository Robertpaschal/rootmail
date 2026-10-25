# Supabase → Rootmail hook setup reference

Unreleased reference, 25 October 2026. This has passed synthetic/local tests,
not an independently followed customer installation or live Sprout sign-in.
Keep the Supabase hook disabled until the production release/pilot gates below
are explicitly cleared. No SMTP fallback is invoked by this adapter.

## Prerequisites and cost

- Rootmail API/worker with migrations 0083 and 0084, auth feature enabled only
  after vault isolation and SES no-engagement feedback are verified. The default
  remains off. Capability preflight rejects older servers, wrong scope and mock
  delivery before submitting a code. Provider rejection can still occur later.
  Both API and worker also require `AUTH_MESSAGE_SCOPES` to contain the exact
  pilot pair, for example `[{"workspaceId":"ws_pilot","subTenantId":null}]`.
  The empty default denies everyone; a workspace entry never admits its clients
  implicitly. Removing an entry blocks queued auth mail at the worker too.
- A verified sender, confirmed test inboxes under sandbox restrictions, and a
  live key in the intended workspace/client. These keys currently have broader
  authority than sending alone. Never expose them to a browser or native app.
- A Node.js server route with HTTPS and a nearby existing PostgreSQL database
  for replay metadata. This does not require another managed database or queue.
  The Rootmail encrypted-content vault is separate from this customer ledger.
- Supabase Email Provider enabled; project URL, Send Email Hook secret, secure
  email-change setting, exact callback allowlist and OTP lifetime known. This
  reference supports configured lifetimes from 600 to 3600 seconds. Do not
  silently assume a default. Supabase still issues and verifies every code.

## Install and configure

1. Pin the reviewed PR #59 source version. `@rootmail/supabase` is private and
   unpublished; do not install an unrelated public package with that name.
   Vendor `packages/supabase` as a workspace dependency and install its locked
   dependencies. With Next.js, include `@rootmail/supabase` in `transpilePackages`
   because this reference exports TypeScript source. Use the Node runtime.
2. Apply `packages/supabase/examples/ledger.sql` to the hook host's existing
   database using an admin/migration role. Grant a dedicated server-only runtime
   role USAGE on `rootmail_auth_hook` and SELECT, INSERT, UPDATE on its `events`
   table. No browser-role grants and no public Data API exposure. Do not run this
   SQL automatically on an incoming request. Use TLS for remote connections.
3. Store the following only in the server secret manager. Generate an independent
   32-byte base64 ledger HMAC key; do not reuse the API key or webhook secret.
   Record configuration separately from secrets so rotation/rollback is possible.

Example Next.js App Router server route (install `postgres` in the host project):

```ts
import postgres from "postgres";
import { createPostgresHookLedger, createSupabaseEmailHook } from "@rootmail/supabase";

export const runtime = "nodejs";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error("Missing hook configuration");
  return value;
};
const database = postgres(required("HOOK_DATABASE_URL"), {
  max: 2, connect_timeout: 1,
  connection: { statement_timeout: 1000 },
});
const ledger = createPostgresHookLedger((query, values) =>
  database.unsafe(query, [...values]));

export const POST = createSupabaseEmailHook({
  hookSecrets: [required("SUPABASE_EMAIL_HOOK_SECRET")],
  supabaseUrl: required("SUPABASE_PROJECT_URL"),
  workspaceId: required("ROOTMAIL_WORKSPACE_ID"),
  clientId: process.env.ROOTMAIL_CLIENT_ID || null,
  rootmailUrl: required("ROOTMAIL_API_ORIGIN"), // HTTPS origin only; no /v1 suffix
  rootmailApiKey: required("ROOTMAIL_LIVE_KEY"),
  from: required("AUTH_FROM_EMAIL"),
  replyTo: required("AUTH_REPLY_EMAIL"), // real support inbox, not reply+ capture
  brand: required("AUTH_BRAND"),
  emailChangeMode: "secure", // must match the actual Supabase setting
  allowedRedirects: JSON.parse(required("AUTH_ALLOWED_REDIRECTS_JSON")),
  defaultRedirect: required("AUTH_DEFAULT_REDIRECT"),
  credentialLifetimeSeconds: Number(required("SUPABASE_OTP_TTL_SECONDS")),
  ledgerKey: required("AUTH_HOOK_LEDGER_KEY"),
  ledger,
});
```

The framework must pass the original Request body, not parse/re-serialize JSON.
For a native app that verifies codes directly, set `deliveryMode: "code_only"`
and omit `allowedRedirects` and `defaultRedirect`. This mode includes the issued
code but no verification link, token hash, or payload redirect. It does not
change Supabase's token verification or expiry. The default `code_and_link`
mode still requires exact permitted HTTPS/native callbacks and rejects localhost.
Exclude only this hook route from application-session middleware; authenticity is
enforced by Standard Webhooks signatures. Keep the rest of the app authenticated.
Disable body/query capture in reverse-proxy logs, APM, error tracking and function
recordings. The handler does not log payloads; it cannot configure hosting tools.
Place the route near Rootmail and the ledger database; cold starts and network
transit consume Supabase's five-second budget before/after the handler's 4.5s cap.

## Retry and expiry semantics

- A hook 200 means every recipient has an observed SES provider ID and `sent` or
  `delivered` status. It does not mean inbox placement, human access, or a valid
  Supabase session. Merely queued work is polled, never acknowledged as sent.
- One shared deadline bounds body streaming, ledger work, both recipient POSTs
  and status polling. There is no nested POST retry loop. Errors have fixed text;
  raw upstream bodies are discarded. Redirects are refused so keys cannot follow
  a redirect to another host. Do not add a hosting-layer retry that changes IDs.
- The ledger stores only a scoped event digest, a keyed commitment and fixed
  expiry. A re-signed/restarted retry reads the same expiry; changed content under
  the same event is refused. Rootmail deduplicates each recipient independently.
  A partial failure can be retried under the same event without resending the
  recipient already accepted. An ambiguous network response is not proof of no send.
- First observation uses the earlier of server time/signature time plus the
  configured lifetime, minus a five-minute reserve. This is conservative, **not
  proof of original token issuance**. A delayed first hook or Supabase resend can
  invalidate a token earlier. Verify actual expiry/resend behavior during pilot.
- Keep expired ledger rows as replay tombstones. Do not delete/reset the ledger
  on redeploy, auto-prune it, rotate its key transparently, or give each replica an
  in-memory store. Erasing these rows loses replay history. Review a bounded
  retention policy before high-volume release; a production retention automation
  has not been implemented.
- A Rootmail send interrupted after its claim is never automatically retried.
  After expiry plus one minute, a bounded sweep records an unknown send outcome
  (or expired queued work), without replaying content. This is an availability
  tradeoff, not a promise of exactly-once delivery. Disabling the auth flag also
  disables this sweep; pending ciphertext still has its absolute expiry.

## Troubleshooting, rotation and rollback

- 401/403: verify hook secret, server key, client/workspace scope and revocation;
  never route around an authorization failure.
- 402/429: quota/rate limit. Do not switch provider or lift beta limits automatically.
- 409/422: conflicting replay, suppressed/failed send, unsupported action or expiry;
  inspect only non-secret message IDs/status. A new sign-in request must originate
  with Supabase; never reuse an expired code or manually retry an auth message.
- 503: unsupported/disabled server, unsafe provider setup, database/network
  failure or deadline reached. Check Rootmail's message evidence before assuming
  nothing was sent. A late provider acceptance may follow a hook timeout.
- Rotate hook secrets with two-key overlap, validate both, then remove the old
  secret. API-key rotation must keep the same scope. Ledger-key rotation requires
  draining/expiring in-flight events and retaining tombstones; old-event retries
  will fail the commitment check. Do not change keys to make a replay pass.
- Before activation, record the previous Supabase email settings and verify the
  fallback sender separately. Roll back by disabling the Send Email Hook and
  restoring that tested configuration. A disabled hook does not prove SMTP works.
  Roll Rootmail back only after disabling admission and draining/expiring auth jobs.

## Pilot gates (not yet observed)

Confirm the deployed version/configuration and exact sender/inboxes; authorize
one live Sprout test; request the code, observe provider acceptance and delivery
separately, enter the code and verify the native Supabase session. Test wrong and
expired codes, resend invalidation and two-recipient change. Record IDs/timestamps
and latency, never codes or links. Then have a second customer follow this guide.

Sources: [Supabase email hook and recipient mapping](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook),
[hook errors and five-second budget](https://supabase.com/docs/guides/auth/auth-hooks).

Configs touched: reference hook-host environment, server-only PostgreSQL schema
and pool settings; no settings were applied to a customer or production host.
Prod behaviour preserved: auth remains disabled and no live emails were sent.
