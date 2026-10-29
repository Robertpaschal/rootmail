# Sprout session and cross-device acceptance — 29 October 2026

**In progress. Broader rollout and HT-005 are not complete.**
This follows the [27 October acceptance record](supabase-rollout-acceptance-2026-10-27.md).
Rootmail delivery worked; native credential persistence blocked the next step.

## Live evidence

The owner authorized at most three additional sign-in emails to their confirmed
inbox. All three were used. The replacement temporary QA key was scoped to the
existing Beta Acceptance workspace. No real email was sent from local tests.

| Request | Observed result |
| --- | --- |
| 28 Oct, 18:32 WAT; `msg_iwofc6gxt1bc62a3ue8vwt1g` | Provider delivery recorded. Repeated Mac Keychain prompts blocked durable sign-in acceptance. |
| 28 Oct, 18:37 WAT; `msg_uev84k33i2pa72we2emvppqn` | Provider delivery recorded. The request-only UI test ended and the code screen was no longer visible; sign-in was not completed. |
| 29 Oct, 06:33 WAT; `msg_ey509nchowbm6fb4r9avs01u` | Provider delivery recorded. Owner entered the code into the held iPhone Simulator UI; independent native sign-in passed, one test, zero skips. |
| Next iPhone relaunch | Hosted sync test failed at the missing signed-in state, before reading the named disposable habit or creating a check-in. Session persistence and round-trip sync did not pass. |

All three Rootmail message records had null retained HTML, text and content hash.
No OTP, token, private verification link or session was copied into this report.
No physical iPhone was tested. The prior Mac pilot's successful restart does not
override this later build's observed Keychain regression.

## Native repair, local only

Sprout's previous command-line builds disabled code signing. Fully signed ad hoc
builds restore bundle identity and entitlements, but do not supply a stable Apple
development identity across Mac rebuilds. The installed Supabase SDK catches
credential-storage failures; an in-memory sign-in can therefore appear successful
without a durable session. This is a plausible cause of the iPhone failure, not
proof of the exact OSStatus from that earlier unsigned process.

The separate Sprout working tree now has a prompt-free Keychain adapter on both
platforms, serialized failure latching, read/write preflight before requesting a
code, and session/sync guards when storage fails. It preserves existing
credentials and local habits. It does not reset Keychain, weaken access controls,
copy another device's session, or fall back to plaintext storage.

Validation:

- Signed arm64 Mac build and iPhone build-for-testing passed.
- Targeted account/storage suite: ten passed, one deliberately opt-in test
  skipped, zero failures. This includes a real Keychain write/read/delete using
  a disposable non-secret marker, outside the app's authentication namespace.
- The opt-in persistence test separately passed in two test processes: the first
  wrote a non-secret marker; the second relaunched, read it and removed it. One
  passed test and zero skips in each invocation. No email was sent.
- The live sign-in/relaunch/sync journey has not been repeated with this repair.

These changes are local in Sprout's shared working tree alongside unrelated
rename/design work; they are not a released Sprout build or a Rootmail runtime
change. No valid Apple development signing identity was initially available.
The owner signed into Xcode and approved an Apple Development certificate.
Automatic signing created it successfully, and the Mac build now uses team
`5WZCWKBND9`. The existing Keychain item still requires owner authorization;
certificate creation alone does not grant that access.

The first no-UI implementation was insufficient on file-based Mac Keychain:
its SecItem UI flag is ignored, and a canceled prompt produced OSStatus -128.
The follow-up uses a serialized, scoped `SecKeychainSetUserInteractionAllowed`
guard, restoring the previous process setting after each operation. Relaunch
then returned -25293 immediately instead of prompting. It denies inaccessible
items; it does not change their ACLs. An explicit account-screen recovery button
allows a bounded user-initiated storage check, then disables interaction before
handing storage to the SDK. The owner must complete the system security dialog.
The signed Mac recovery build and ten targeted iPhone tests pass; real recovery
and durable session acceptance are still pending.

Platform evidence: [Chromium implementation and FB16959400 explanation](https://chromium.googlesource.com/chromium/src/crypto/+/refs/heads/main/apple/scoped_keychain_user_interaction_allowed.cc).

## Verified pilot cleanup

- Supabase Send Email Hook visibly Disabled.
- Replacement QA key revoked; a production-host request returned HTTP 401.
- No queued or sending auth messages remained.
- Original API/worker flags, host compose overlay and proxy restored; the same
  immutable API/worker images restarted healthy.
- Optional hook/vault containers and private network removed; temporary secret
  files and transport private key removed.
- Limited ledger role set to NOLOGIN with its password removed. Six non-secret
  replay tombstones retained.
- Six core services healthy with zero restarts at the final check. API health
  and public sites returned 200; authenticated sites reached 200 after redirects.

API/worker: `effd2bdbe3fe5f52b2f960c3a6075817c7e2cc4a`;
dashboard: `328f5ade6bcb9f916cba758360e07e9b7961420b`;
admin: `cd3d3ff90454d045167d0a750a70fbdc25942e6c`;
marketing/developers: `182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1`.
No instance/database/cache resizing or new paid infrastructure occurred.

SSM cleanup evidence: `a36fc61d-d74e-4ce3-811c-166031ab6c76` (Success).
Final health/configuration evidence: `76199ea0-31d2-4869-b7f0-65226eef5616` (Success).

Local Xcode evidence under
`~/.cache/rootmail-acceptance/20261028/`:
`iPhoneHeldSignIn.xcresult`, `iPhoneHostedSync.xcresult`,
`KeychainAccountFinal.xcresult`, `KeychainRecoveryTests.xcresult`, `KeychainWriteFinal.xcresult`,
`KeychainReadFinal.xcresult`, `mac-final-build.log`, `signed-final-build.log`,
`mac-development-signing.log`, `mac-recovery-build.log`.
These are local artifacts, not independent customer or CI acceptance.

## Remaining closure gates

1. Stable signed Mac build with accessible credential storage; successful real
   sign-in and session restoration on both platforms after the repair.
2. Mac habit observed on independently signed-in iPhone, then iPhone check-in
   observed on Mac; restart/retry/offline-conflict acceptance.
3. The owner renewed a separate allowance of at most two sign-in emails after
   approving stable signing setup. That retest has not started: no replacement
   key, hook enablement or new email yet. The prior three-email pilot is retired.
4. Ongoing compatible auth delivery: default Supabase fallback is link-only while
   Sprout expects a code; no ongoing Rootmail auth sending is currently enabled.
5. Independent customer installation, exact expiry/resend behavior, authenticated
   cross-owner API acceptance and end-user deletion/retention acceptance.

SES sandbox restrictions remain. This report does not authorize or claim
unrestricted sending, a provider appeal, broader beta readiness, or full sync.
