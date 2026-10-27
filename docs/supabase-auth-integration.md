# Supabase authentication email integration

Implementation checkpoint: 24 October 2026, started from main `328f5ad` on
`codex/supabase-auth-integration`. This identifies the inspected source, not the
currently running production image. No live environment was modified or tested
in this increment.

Task: [Rootmail / Sprout pilot](https://app.notion.com/p/4032db0e8691818496f5c235840c351c).

Latest operational evidence: [configuration, release and controlled pilot
validation](sprout-pilot-validation-2026-10-25.md). API/worker `effd2bd` is deployed;
native Mac sign-in and session restoration passed on 26 October. The temporary
pilot was then retired. [Broader acceptance](supabase-rollout-acceptance-2026-10-27.md)
remains open. The dated implementation increments below are historical.

## First increment — signed planner

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

## Second increment — authentication content policy

**Update, 25 October:** the server-side first version below is implemented on the
draft branch and tested with fake delivery. The numbered list remains the review
checklist for rollout; it is not a claim that production has this policy enabled.

### Implemented server contract (disabled by default)

`POST /v1/auth-messages` accepts only `policy: "authentication-v1"`, `to`, `from`,
optional `reply_to`, rendered `html`/`text`, absolute `expires_at` and a required
`idempotency_key`. Scope comes from the live API key and optional existing client
header. No templates, variables, metadata, tags, attachments or scheduling fields
are accepted. A generic subject is enforced; branding belongs in the protected
body. Conversation-capture reply addresses are refused.

PostgreSQL records only the generic subject, sender/recipient, expiry, a private
keyed request commitment and normal delivery IDs/status/timings. A database CHECK
constraint prevents auth rows from retaining body, variables, metadata, body hash
or attachments. Existing retention/erasure can still replace the subject with
`[redacted]`. Public message/proof responses disclose the auth policy and do not
offer a content proof. No conversation is created. Request-body logging is redacted;
auth errors use fixed text, not parser/provider/Redis diagnostics.

Bodies are AES-256-GCM encrypted with a dedicated key and scope/deadline binding
in a separate ephemeral Valkey instance. Writes use NX + absolute expiry; neither
replay nor retry renews it. Reads atomically GETDEL before the provider attempt.
Every write/read validates no RDB schedule, no AOF, no replicas, bounded memory and
noeviction; permission denial fails closed. This is deliberately unavailable on
the durable BullMQ cache. Configure no persistent volume, snapshots, host-memory
dumps, swap or APM payload capture. Runtime checks cannot prevent an administrator
manually snapshotting memory or changing configuration between checks. Encryption
does not promise forensic zeroing of process memory or the recipient's inbox.

Admission preserves sender verification, recipient sandbox limits, tenant feature
gates, suppression, suspension and quota checks. Namespaced per-client keys and
private HMAC commitments reject conflicting replays. Only new records reserve
quota; a concurrent loser refunds it. Replays can recover a failed enqueue without
restoring content or changing the original deadline. Queue jobs contain only IDs,
use high priority and one attempt. Worker CAS + GETDEL prevents concurrent sends.
Manual resends of auth messages are refused: request a fresh credential upstream.

The worker rechecks expiry before normal gates, before a throttle deferral, before
reading content and immediately before provider I/O. It refuses deadlines within
15 seconds of expiry or more than one hour away. **The caller must supply the
original credential deadline**; the server does not know Supabase issuance time.
The adapter still needs durable first-event expiry handling across re-signed hooks.
Rootmail cannot recall a message after SES accepts it or control SES's later SMTP
delivery attempts. A code may be invalidated upstream earlier by a resend.

The initial real provider path is **platform SES only**, never BYO/dedicated-IP
fallback or mock simulation. Before sending, it reads the configured auth event
destinations and requires DELIVERY/BOUNCE/COMPLAINT with no enabled OPEN/CLICK.
Links additionally carry `ses:no-track`. The dedicated SDK path uses one attempt
and a five-second abort budget. Auth feedback ignores engagement URLs/user agents
and sanitizes bounce/complaint diagnostics. Ordinary mail tracking is unchanged.

An ambiguous provider failure consumes the content and records an unknown outcome;
it does not automatically resend. A crash after claiming a send can leave a
`sending` record with unknown outcome. Do not turn it back into `queued`; a future
reconciliation sweep must classify stale claims without resending. This availability
tradeoff and provider latency still need pilot evaluation before activation.

### Configuration and staged rollout gates

- `AUTH_MESSAGES_ENABLED=false` by default on API and worker. No production flag
  or infrastructure was changed in this implementation.
- `AUTH_CONTENT_REDIS_URL`: a separate bounded ephemeral store. A small container
  on the existing host is a candidate, not a new managed AWS service commitment.
  Validate isolation, authentication/TLS or loopback, persistence and memory budget
  before enabling. The local test fixture uses 64 MB and no host data volume.
- `AUTH_CONTENT_KEY`: independent canonical base64-encoded 32-byte secret, shared
  only between API/worker. Never copy the development fixture key. Disable
  admission and drain/expire the vault before rotating; old queued ciphertext and
  request commitments cannot be transparently recovered under a replacement key.
- `AUTH_SES_CONFIGURATION_SET`: an explicitly configured no-engagement set with
  existing delivery/bounce/complaint feedback wired to Rootmail. Worker credentials
  need read access to its event destinations. No AWS permission was added here.
- Apply journaled migration `0083_auth_content_policy` before starting the new
  code. Deploy both API and worker with the flag **off**, verify tests/configuration,
  then enable only for an approved pilot. Do not enable while an old worker can
  consume auth jobs. Rollback: disable admission first; drain or expire pending
  auth rows before reverting to a worker that does not understand the policy.
- Do not claim send-only credentials, high availability, exactly-once delivery,
  full Supabase compatibility or a deployed integration. The private adapter is
  still disconnected. Existing client-scoped keys retain broader capabilities.

### Local security acceptance fixture

Run PostgreSQL and queue Valkey on isolated test ports, then start a *separate*
auth vault (do not change persistence on an existing database/cache):

```sh
docker run -d --name rootmail-auth-vault-local -p 127.0.0.1:6395:6379 \
  valkey/valkey:7.2-alpine valkey-server --save '' --appendonly no \
  --maxmemory 64mb --maxmemory-policy noeviction
```

Set `DATABASE_URL`/`REDIS_URL` to the test fixtures and
`AUTH_CONTENT_REDIS_URL=redis://127.0.0.1:6395`, `MAIL_PROVIDER=mock`,
`DNS_VERIFY_MODE=mock`. Run `pnpm db:migrate` against **that local database only**,
then the normal test command. CI creates its own ephemeral vault. The tests enable
the flag only inside their isolated process and inject fake provider responses.

### Remaining policy review checklist

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
a native app or persistence; those first-increment checks alone do not establish acceptance.

Second-increment checks on 25 October (WAT): 22 new security tests (6 core vault,
4 SES transport, 12 database-backed API/worker tests), alongside the 27 planner
tests. These exercise encrypted storage/scope/expiry, unsafe vault rejection,
strict input handling, database privacy constraints, client isolation, conflicting
replays, concurrent admission/worker claims, stale-worker failures, deferred queue
settings, revoked keys, suppression, kill switches, mock refusal and sanitized
provider feedback. All delivery is injected or mocked; no live mail is sent.

The workspace test, typecheck and build gates passed locally (25 Turbo tasks,
including six builds). The design/truth audit and whitespace check passed.
Parallel API-file runs exposed an existing shared rootmail-hq daily-counter race
in the system-mail-preview tests. API files now run sequentially; explicit
concurrent-admission/send checks still run concurrently inside their tests. The
full run passed after this test-harness change. This does not alter production
limits or sending behavior. Run build and typecheck in sequence: running both at
once raced Next.js generated types locally (TS6053); that is not an application
type error. Remote CI must be checked against the pushed head;
an earlier planner-only CI result is not evidence for this increment.

## Third increment — bounded hook transport and recovery

Implemented on 25 October, still private/unreleased. `createSupabaseEmailHook`
mounts a Web Request handler using the existing signed planner. It preflights
policy, provider and authenticated workspace/client before posting secrets;
unsupported or mock servers fail closed. A shared maximum 4.5-second deadline
includes bounded upload/response streaming, ledger work, both recipients and
backed-off status polling. No POST retry loop or ordinary-send fallback exists.
Success requires observed SES acceptance for every recipient, not queueing.

`createPostgresHookLedger` uses the customer's existing server-only PostgreSQL
pool. Its atomic insert-or-read freezes a scoped event's keyed commitment and
first expiry across concurrent requests, re-signing and handler restarts. No
recipient, code, body or unkeyed content hash enters this table. Conflicts fail
closed; expired records remain tombstones. Partial recipient completion and
ambiguous HTTP responses retry against Rootmail's existing recipient keys.
Automatic ledger pruning and transparent HMAC-key rotation are not implemented.

The initial deadline reserves five minutes from the configured 10–60 minute
lifetime. Signature time is not proven credential issuance: delayed first
observations and Supabase resend invalidation still require live validation.
This is not a guarantee that every queued credential remains usable upstream.

The existing sequence tick now runs a bounded, feature-gated auth reconciliation
sweep. After expiry plus one minute it classifies expired queued work or unknown
claimed-send outcomes, with an atomic audit entry and no resend. Migration 0084
adds a partial pending-auth expiry index. Ordinary messages are excluded. A sweep
failure is isolated from sequence processing. Completed queue logs now say
"processed send job", not "sent", since a job may have been refused or deferred.

The earlier sections describe the first two increments: the previously listed
missing transport/ledger/reconciliation now exist on this branch. Remaining
release gates are operational configuration/privacy checks, pilot latency and
actual expiry/resend behavior, a real Supabase/native session, and an independent
customer walkthrough. No provider or production change is authorized by these
implementation checks. See [setup reference](supabase-hook-setup.md).

Third-increment focused checks: 11 new hook tests (38 package tests total), plus
three new API integration tests (15 auth-path tests total). The real local
PostgreSQL/queue/API/worker test observed two synthetic provider acceptances and
no additional send on a re-signed retry. Concurrent ledger claims retained one
deadline; a new ledger instance read the same record. Stale-claim reconciliation
kept sent evidence intact and never resent. No network mail was sent. Full
workspace/CI results are recorded in the PR and Notion against the final commit.

Configs touched: private package configuration/lockfile (first increment), disabled
auth environment settings/template, migration schema/journal, API test scheduling
and CI's isolated test vault; migration 0084 and reference customer-ledger SQL/setup
in the third increment. Prod behaviour preserved: ordinary sends keep their behavior; auth is off by
default. No production migration, environment change, deployment, live email,
production key creation or Supabase configuration update was performed.
