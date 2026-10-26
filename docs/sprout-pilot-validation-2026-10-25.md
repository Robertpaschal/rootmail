# Sprout auth pilot: configuration validation

Latest checkpoint: 26 October 2026. **Rootmail backend deployed; Supabase hook
not activated and no native Sprout sign-in or live auth email verified.** The
historical read-only observations below are followed by the release evidence.

## Rootmail production

- AWS account `130299713609`, region `us-east-1`; deployment identity
  `claude-depoy`. SSM reports the consolidated ARM host online.
- API, worker and dashboard run `328f5ade6bcb9f916cba758360e07e9b7961420b`.
  Admin runs `cd3d3ff90454d045167d0a750a70fbdc25942e6c`; marketing and developer
  sites run `182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1`. All six are healthy.
  The older all-six-on-one-SHA checkpoint is historical.
- Host observation: 3,824 MiB RAM, 2,530 MiB available, no swap, 9.1 GiB free
  disk (51% used). This is a point-in-time capacity check, not a load test.
- Auth environment flag, vault URL/key and auth SES set are unset. Production
  has no `messages.auth_*` columns. PR #59 and migrations 0083/0084 are not deployed.
- SES sending enabled, enforcement HEALTHY, production access false. Quota:
  200/day and 1/second; zero sends in the preceding 24 hours at observation.
- `rootmail-platform` publishes SEND, DELIVERY, BOUNCE, COMPLAINT, DELIVERY_DELAY,
  REJECT and RENDERING_FAILURE to the existing SNS topic. No OPEN/CLICK events.
  Configuration-set archiving, tracking options and VDM overrides are absent;
  account VDM settings are absent. Sending is enabled.
- The production worker's actual credentials initially received `AccessDeniedException`
  from `GetConfigurationSetEventDestinations`. The deployment user's read succeeds.
  Ordinary send permission does not establish permission for this auth safety check.
- Prepared [minimal runtime read policy](ops/auth-ses-read-policy.json): one
  `ses:GetConfigurationSetEventDestinations` action on the exact
  `rootmail-platform` ARN. After Robert's approval on 26 October, the console
  confirmed `rootmail-auth-config-read` attached to `rootmail-app`. The same
  runtime check then succeeded, returning only the expected non-engagement
  events. The deployment identity still has no IAM administration permission.

SSM evidence IDs (outputs contain no credentials or message content):
`02a2e6c2-b161-452a-89bd-100dbaf44aec` (host/images/config presence),
`9dad672e-de52-431f-b7ad-5ea5bb4b091c` (candidate workspaces/schema),
`9bc1944f-7af6-44c8-ae13-ceffb719a728` (runtime SES read denial).
The successful post-permission check is `a3f6fc13-eab2-40e1-a342-529de0e07c18`.

## Sprout hosted settings

The existing in-app GitHub sign-in refreshed successfully after Supabase reported
an expired session. No new login permission or project was created.

- Project `sprout-dev-us`, reference `mhuvdulhieawrcdwughy`, US East (North
  Virginia), Free plan, NANO, healthy. Latest migration shown: `personal_sync`.
- No Auth Hooks configured. Email provider and new signups enabled; email
  confirmation enabled; anonymous sign-ins disabled.
- Eight-digit email OTP, 3,600-second expiry, secure email change enabled.
- Site URL remains `http://localhost:3000`; redirect allowlist empty.
- Custom SMTP is not configured; templates page says default templates apply.
  No fallback delivery has been tested.
- Sign-in/signup and token-verification limits each show 30 requests/5 minutes
  per IP. The displayed 60-second interval is labelled as applying to custom SMTP;
  do not infer its hook behavior without testing.
- Native code inspection: the app requests `signInWithOTP`, then verifies an
  entered code; the input accepts eight digits. No native session was observed.

The local Sprout `supabase/README.md` still says no hosted project exists.
The newer Notion HT-005 record and this live inspection supersede that sentence.
Its working tree contains substantial unrelated native-app edits; this pass did
not rewrite or commit them.

## Prepared pilot controls

PR #59 now requires an explicit `AUTH_MESSAGE_SCOPES` JSON allowlist on both API
and worker, in addition to the disabled-by-default feature flag. Empty denies all;
workspace scope does not implicitly enable its clients. Removing a scope also
stops queued auth sends. A database-backed test verifies those boundaries.

The adapter has an explicit `deliveryMode: "code_only"` for native OTP consumers.
It emits no verification URL, token hash or callback from the hook payload.
Default link mode keeps the exact HTTPS/native redirect allowlist. This avoids
sending Sprout users an unusable localhost link without weakening callback checks.

The existing Sprout chat's Rootmail session selects **Robert Beta QA / Production**,
confirmed as `Rootmail Beta Acceptance 20261015`, live workspace
`ws_dgdl6gmn84qh5x8e93cqp5db`. Read-only database inspection confirmed no sending
suspension, normal reputation, the owner Gmail address as a verified recipient,
and its default verified beta sender. After explicit approval, temporary key
`key_6x28z8pmaf3ind40vsezeuq0` was created for at most eight owner-inbox checks.
It was encrypted for transfer to the host, decrypted only into a root-owned
0600 file on `/run`, and the local temporary copy removed. Revoke it after the
pilot and verify HTTP 401. It is a workspace key, not an endpoint-limited key.
No pilot email has yet been sent.

The runnable isolated hook listener now passes two real HTTP fixture tests;
recipient admission brings the adapter suite to 40 passing tests. All seven
workspace test tasks pass (258 API tests), typecheck and all six builds pass,
and the design audit reports zero blockers. Production runtime-image CI must
still verify the newly added entrypoint/dependency packaging before release.

## Remaining activation and acceptance

1. Runtime SES read permission is applied and verified. Preserve its exact scope.
2. Finish the reviewed hook-host deployment and durable ledger configuration.
   A dedicated HTTP listener and optional Compose overlay are now prepared;
   no executable HTTPS hook is deployed yet. Use the existing host/database where
   suitable; the observed capacity does not justify a new paid instance.
3. Release PR #59 through exact-main CI, images, reviewed migrations and the
   guarded canary path. Provision a separate bounded non-persistent content vault;
   verify no persistence/replicas/backups, no swap, protected networking and logs.
4. Use the exact QA scope, verified sender and confirmed owner inbox; keep its
   server key out of the native app. Set the actual 3,600-second lifetime,
   secure email-change mode and code-only delivery. Match API/worker allowlists.
5. Activate the Send Email Hook only after capability and non-delivery safety
   checks pass. Keep the previous Supabase settings for rollback. Disabling the
   hook returns to the untested default sender, not a verified SMTP fallback.
6. Request a controlled native code; separately record enqueue, provider ID,
   delivery, inbox arrival and authenticated session with timestamps. Verify wrong
   code, resend/expiry behavior and duplicate events without recording codes/links.
   Revoke the temporary key and disable admission when the pilot ends.

The root `pnpm test` command now pins mock mail/DNS and passes the selected fixture
environment to Turbo. A prior bare Turbo run filtered the fixture overrides; the
auth suite refused setup. The CI-equivalent run then passed, and the corrected
root test command passed as well. No test success here proves live delivery.

References: [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook),
[AWS SES IAM action/resource scope](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).

## Release and isolated runtime — 26 October 2026

PR #59 merged as `effd2bdbe3fe5f52b2f960c3a6075817c7e2cc4a`.
[Exact-main CI](https://github.com/Robertpaschal/rootmail/actions/runs/40288446479)
and [image publishing](https://github.com/Robertpaschal/rootmail/actions/runs/40288693690)
passed. API and worker deployed through the guarded canary path, with migrations
0083/0084 applied while auth was disabled. The earlier production-image list is
superseded for API/worker only. All six application services remain healthy.

Two of the eight approved owner-inbox sends were used:
- API canary `msg_hpctfpeh81d23fvuehi5otek`: provider ID and delivery event observed.
- Worker canary `msg_lmbt50hzgw3jvv5yngli7p4y`: provider ID and delivery event observed.

These are ordinary transactional canaries, not proof of auth delivery or a native
session. Release SSM command: `3dd3023f-64e2-4d35-93f1-fa64e43cef4c`.

The approved runtime SES read policy remains exact-scoped. A separate
`rootmail_sprout_hook` database role has ledger SELECT/INSERT/UPDATE and no read
access to customer messages. Its TLS connection verifies the RDS CA and host.
The ledger retains only replay metadata, not codes or recipient addresses.

The private vault has 64 MiB maximum data memory, 96 MiB container memory/swap
limit, no RDB/AOF, no replicas, no published port, read-only filesystem and tmpfs.
Its default user is disabled. The restricted auth user passed one-time GETDEL
and was denied other key namespaces, CONFIG SET and MONITOR. The host has no swap.
Its ACL file is under root-only `/etc/rootmail`; no memory snapshots are configured.
Isolation check: `6356a0c5-e1c3-4fc3-b691-f3fcef93288a`.

API and worker now share the exact QA allowlist and private vault configuration.
The separate hook container is bounded to 192 MiB, no swap/core dumps, read-only,
with no extra capabilities. Health passes and restarts are zero. Its environment
contains only the hook settings, temporary QA key and limited ledger URL.
Caddy's existing host-network setup routes only the exact hook path to loopback
4011. No access logger or request-body recording was added.

Public HTTPS checks: ordinary API dependencies healthy; unsigned hook rejected
with 401; a validly signed synthetic outside-pilot recipient rejected with 403
before sending; exact QA capability returns the expected SES/workspace contract.
Evidence: `465d792f-0ec5-4cb3-a111-2c246f43107c`,
`b7a94b2d-4e51-4546-a38d-f7b45baa5b72`, `41d59f52-6c88-4920-8db9-72449f04d2f9`.

The current native Sprout Mac build passes using the existing local configuration;
its unrelated working-tree changes were not edited or committed. Native UI control
reports the Mac locked; an unlock request is pending. The Supabase HTTPS hook form
is prepared but unsaved, awaiting the required action-time approval. No live auth
code has been requested. Do not mark the integration or HT-005 complete.

After the pilot, disable its Supabase hook/admission, revoke the temporary key
and verify 401, stop the optional hook/vault containers, remove temporary secret
material and preserve ledger tombstones. Do not leave the hook enabled with a
revoked key: sign-in emails would fail. Default Supabase delivery remains untested.
