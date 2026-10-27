# Supabase rollout and Sprout sync acceptance

Status: **In progress. Do not close broader rollout or HT-005.**
This continues the [successful controlled pilot](sprout-pilot-validation-2026-10-25.md).
It distinguishes local fixtures, hosted observations and open acceptance gates.

## Observed on 27 October

| Check | Evidence and limits |
| --- | --- |
| Adapter regressions | 40/40 package tests passed; synthetic delivery. |
| Clean consumer | Public `@rootmail/supabase` imports worked after installation outside the monorepo. Six action types, two-recipient mapping, signature denial and reconstructed-handler retry passed. Transport and ledger query results are fixtures. |
| Sprout model | Four cloud-sync XCTest cases and 12 core Swift Testing cases passed in a fresh scratch directory. |
| Database invariants | Disposable PostgreSQL tests passed for ownership, anonymous denial, idempotency, conflicts, validation and rollback. This is not hosted Data API acceptance. |
| Deletion cascade | Extended disposable SQL tests passed: deleting a fixture auth user removes its account, habits, check-ins and replay receipt, preserves the other owner, and rejects recreation by a stale identity. This does not implement or prove an end-user account-deletion flow. |
| Hosted anonymous access | Using only the app's publishable key, all four table reads and `habit_snapshot` returned HTTP 401 / PostgreSQL 42501. No signed-in session was copied or user records returned. This does not prove authenticated cross-owner isolation through the Data API. |
| iPhone app | Fresh arm64 build and build-for-testing passed. Installed on the iPhone 17 Pro / iOS 26.2 simulator; UI rendered. No physical iPhone acceptance is claimed. |
| Hosted code request | Explicitly authorized Xcode UI test used the normal native form, without copying a session or resetting data. One test passed, zero skipped. |
| Default email | Supabase sent “Your sign-in link” to the owner inbox at 08:05:24 UTC (09:05 WAT). It was link-only; native Sprout expects an eight-digit code. Sign-in did not complete. |
| Default template edit | Dashboard requires custom SMTP or Pro for template customization; source editing and saving are disabled. No upgrade or provider change was made. |
| Mac data | Created the disposable habit “QA sync 27 Oct — disposable,” cue “Mac to iPhone acceptance.” Mac displayed Up to date. This alone does not prove remote persistence or a second-client read. |
| Provider access | SES reports sending enabled, HEALTHY, production access false, 200/day and one/second. Unrestricted sending remains blocked. |

## Reproducible automated checks

```sh
pnpm --filter @rootmail/supabase test
node scripts/check-supabase-consumer.mjs
```

The clean consumer uses only vendored source/metadata and a pinned package-manager
version, does not read Rootmail `.env`, forbids default runtime fetch and removes
its temporary directory. Dependency installation may use the package registry.
It is included in CI. An independent customer still needs to follow the setup
guide with their own workspace and server secrets.

Sprout checks live in its separate repository: `swift test --package-path
apple/SproutCore --scratch-path <fresh-directory>`, `supabase/tests/run-postgres.sh`,
and the opt-in `HabitFlowTests/testOpenHostedAccountSignIn` UI test. Normal UI
test execution skips the hosted test unless explicitly enabled with an email.
The UI test never reads or supplies a code. Its first invocation skipped because
the runner lacked the opt-in environment; only the later enabled invocation is
the successful request evidence.

## Open acceptance

- Restore a bounded, authorized code-delivery path for the independent iPhone
  sign-in; keep server credentials out of the native app. Retire temporary access
  after acceptance and document whether ongoing sign-in remains available.
- Observe Mac → iPhone and iPhone → Mac habit/check-in changes through hosted
  storage, then restart, retry and conflict behavior. Do not reuse the Mac session
  as a shortcut to a second independent session.
- Verify immediate resend invalidation and controlled expiry behavior; do not
  infer them from email arrival or an old-code rejection hours later.
- Complete account deletion/retention acceptance using disposable data/accounts,
  including ownership and prevention of resurrection. Never delete the owner account.
- Have an independent customer complete installation, and obtain applicable
  delivery access before unrestricted onboarding. No SES appeal is filed here.

## Current operational boundary

API/worker remain on `effd2bd`; the prior pilot key is revoked and its hook/runtime
are retired. Supabase's default email path now has an observed incompatibility
with the native code UI. A prepared new temporary QA key is awaiting action-time
approval; it has not been created. No additional paid resource has been created.

Local evidence: `/tmp/rootmail-consumer-acceptance-20261027.log`,
`/tmp/rootmail-supabase-acceptance-20261027.log`,
`/tmp/sprout-core-acceptance-20261027.log`,
`/tmp/sprout-sql-acceptance-20261027.log`,
`/tmp/sprout-anonymous-acceptance-20261027.log`,
`/tmp/sprout-rollout-ios-build.log`,
`/tmp/sprout-live-signin-enabled-20261027.xcresult`.
These local artifacts are not durable CI or independent-review evidence.
