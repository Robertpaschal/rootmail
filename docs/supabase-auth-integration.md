# Supabase authentication email integration

Implementation checkpoint: 24 October 2026, started from main `328f5ad` on
`codex/supabase-auth-integration`. This identifies the inspected source, not the
currently running production image. No live environment was modified or tested
in this increment.

Task: [Rootmail / Sprout pilot](https://app.notion.com/p/4032db0e8691818496f5c235840c351c).

## Current increment

`packages/supabase` contains a private, transport-free planner. It verifies raw
signed hooks, validates supported actions, maps recipients/codes/links, isolates
configuration and retry-key namespaces, and protects common accidental inspection
paths. See its README for the action matrix and test command. This is not a
published integration, a successful send, or an end-to-end Sprout acceptance.

## Why live transport is gated

The existing ordinary send path is designed for visible, auditable correspondence:

- `apps/api/src/routes/messages.ts` renders and persists `renderedHtml`,
  `renderedText`, variables and a content digest. Its Zod schema strips unknown
  properties; a caller inventing an auth-policy field would not obtain privacy.
- `apps/worker/src/pipeline.ts` copies bodies to `openConversationForSend` before
  sending. Suppressing a preview in the UI would leave these copies accessible.
- `apps/api/src/lib/serialize.ts` exposes thread bodies. A single send-response
  redaction would not address conversation, export, support and proof surfaces.
- `packages/core/src/queue.ts` configures delayed/retried jobs without a per-message
  credential expiry. A high-priority queue alone cannot prevent stale codes.
- `apps/api/src/routes/apikeys.ts` offers workspace/client isolation, but not
  endpoint-level send-only permissions. Do not advertise that key as least privilege.

These are requirements for the new auth path, not defects in retention of ordinary
customer correspondence. Keep existing transactional/marketing behavior unchanged.

## Required next increment: authentication content policy

Before connecting the planner to Rootmail's HTTPS API:

1. Define a versioned, explicitly supported auth contract. Unsupported servers
   must reject before accepting any secret. Reuse workspace/client authorization
   and sender validation; never trust tenant/sender claims in hook metadata.
2. Keep codes, token-bearing URLs and rendered bodies out of normal message rows,
   conversations, templates/variables, previews, searches, exports, support views,
   proof artifacts, audit events and logs. Do not keep a bare body/code digest;
   small OTP spaces can be brute-forced against it. Verify all read surfaces.
3. If asynchronous sending needs temporary content, use separately encrypted,
   short-lived storage with an explicit key and deletion lifecycle. Queue only
   IDs. Document persistence, backups, failed jobs, crash recovery and maximum
   secret lifetime; a Redis TTL alone does not prove all copies are gone.
4. Preserve non-secret evidence: message/event IDs, workspace/client, recipient
   where authorized, action, timings, provider ID, safe failure category. Avoid
   provider exception text that may echo payloads. Enqueue, provider acceptance
   and delivery must remain distinct observations.
5. Disable open/click rewriting and tracking for auth messages across supported
   providers, including configuration-set behavior. Do not flip global defaults
   or mislabel a pixel/scanner as verified human interaction.
6. Bind expiry to original credential issuance/first accepted event and configured
   Supabase TTL with a conservative safety margin; retries must never extend it.
   Check before admission, delayed/throttled retry and the final provider call.
   Supabase may invalidate an older credential on resend; expiry alone does not
   prove a token is usable. Do not claim the planner's signature time proves it.
7. Add durable recipient-level idempotency and payload-conflict handling scoped
   to the authenticated project/workspace/client. Test concurrent retries and
   two-recipient partial completion. Stable local keys alone are not a ledger.
8. Assess/enforce send-only API-key capabilities before calling the integration
   least-privileged. Until then disclose the client's broader key authority.

## Transport and pilot gates

- Add the HTTPS transport only after the server policy exists. Bound total hook
  work, not each recipient independently: Supabase documents a five-second HTTP
  hook budget. Account for verification, cold starts and both recipients; avoid
  stacking an adapter retry loop on upstream retries.
- Test revoked keys, suppression, quota/rate rejection, provider failure, slow
  response, ambiguous timeout, sandbox simulation and partial recipient success.
  Do not silently fall back to ordinary sending, a different tenant or provider.
- Explicitly distinguish accepted queue work from a real provider send. Never
  acknowledge sandbox simulation as a production auth email.
- Complete an independently usable second-customer guide and test it with mock
  credentials first. Keep package private until the actual delivery path works.
- Separately authorize a confirmed-inbox Sprout pilot: request code, observe
  queue/provider/delivery timestamps, enter code, verify native Supabase session.
  Include wrong/expired codes and resend limits. Record IDs/times, never codes.
- Verify current provider access/identity/quota and production version before
  enabling wider signups. No SES appeal/provider strategy change is authorized
  by implementation of this task. Measure latency before promising an SLO.

## Verification scope

First-increment checks completed on 25 October 2026 (WAT): 27/27 new unit tests,
workspace typecheck (13 packages; 14 successful Turbo tasks including the SDK
build dependency), design/truth audit (zero blocking violations), frozen offline
dependency installation and `git diff --check`. These are local results, not a
production test or CI release result. The full database-backed suite and app build
were not run locally for this isolated, runtime-disconnected package.

The planner's unit suite checks signature rejection, time window, rotation,
action matrix, secure/single email changes, malformed payloads, retry-key scope,
redirect allowlisting, HTML escaping and redacted default inspection. Tests use
synthetic fixtures only. They do not exercise a real Rootmail tenant key, a provider,
a native app or persistence; those acceptance boxes remain open.

Configs touched: new private package manifest/TypeScript configuration and lockfile.
Prod behaviour preserved: no runtime import, migration, environment change,
deployment, live email, production key creation or Supabase configuration update.
