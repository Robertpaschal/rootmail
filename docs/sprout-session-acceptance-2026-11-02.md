# Sprout signed-session acceptance — 2 November 2026

Status: **Independent sessions, restart and both-direction hosted sync passed. Broader rollout remains gated.**

This follows the [29 October session regression](sprout-session-acceptance-2026-10-29.md).
The owner authorized at most two further sign-in emails to the same owner inbox,
with temporary pilot access retired afterward. Both were used and the pilot is retired.

## Native recovery

Apple Development signing is established. The owner reported that the explicit
Keychain retry still repeated its password prompt. The local Sprout follow-up
removes that interactive retry. Background storage operations deny inaccessible
items without opening authentication UI; they never grant credential access.

The replacement **Start a fresh sign-in** action preflights a fixed, separate
app-owned Keychain service. It neither reads nor deletes the inaccessible legacy
entry, and preserves local habits. Only the non-secret choice of storage namespace
is saved in preferences. There is no plaintext credential fallback.

Observed on the signed Mac build: fresh storage preparation passed; quitting and
reopening returned to the normal email form without a password prompt. The real
code request also succeeded without a prompt. After owner code entry, the Mac
showed the signed-in owner and Up to date. The process was then quit, its exit
confirmed, and the exact signed app reopened. Account & sync still showed the
owner, Up to date and Sign out on this device without a password prompt.
**Real Mac session restoration passed.**

The signed Mac build passed. `FreshStorageTests.xcresult` records ten targeted
account/storage tests passed, one deliberate opt-in skip and zero failures. The
previous separate two-process non-secret persistence check remains synthetic
evidence. Sprout source changes remain local in its shared working tree alongside
unrelated rename/design work; no native app release is claimed.

## Bounded delivery evidence

- API and worker were observed on `db93880e924ac679e24b8cb40abef4ff77e57beb`
  (separately released PR #62). Pilot activation preserved that release.
- All six core production services were healthy. No new paid resource was created.
- Public capability validation returned the exact QA workspace, null sub-tenant
  and SES provider. The hook rejected unsigned input with 401 and a correctly
  signed request for a recipient outside the pilot with 403. Neither test sent mail.
- The first approved native Mac request produced
  `msg_jjashtvo771iwxmiowgk39or` at 06:16:29 UTC / 07:16:29 WAT on 2 November.
  Provider delivery was recorded. Retained HTML, text and content hash were null.
- Owner Mac code entry and authenticated restart passed before starting the
  independent iPhone login. No session was copied between devices.

## Independent sessions and hosted sync

The owner entered the second email's code directly in iPhone 17 Pro Simulator
(iOS 26.2). `testOpenHostedAccountSignIn` passed with zero skips. A separate test
process relaunched Sprout, found the restored signed-in account, requested sync,
read the Mac-created `QA sync 27 Oct — disposable` habit and checked it in.
`testHostedReceiveHabitAndCheckIn` passed with zero skips. The Mac then synced
independently and showed 1 of 1 complete and the same habit's Undo control.

For a second round trip, the Mac undid that disposable check-in and reached
Up to date. The iPhone test relaunched again, observed the now-unchecked habit,
checked it in and synced successfully. The Mac read the second check-in, still
showing one habit and one completion. This confirms sequential updates and
session restoration across independent client processes; it is not a physical
phone test, an offline fault injection or a simultaneous conflict test.

Three hosted UI test executions passed, zero failures or skips. No session was
copied, no account was reset, and no code was passed through test arguments,
environment or logs. Test attachments were configured not to be retained.

The second provider-delivered message was `msg_ro29oi5ov3fpl9pkr2jf9d5v`, created
at 06:22:20 UTC / 07:22:20 WAT. Its retained HTML, text and content hash were null.

## Verified cleanup

Supabase's Send Email Hook is Disabled. The temporary QA key ending 1CAQ is
revoked and rejected with HTTP 401. No auth messages remained queued/sending.
Core environments, compose and proxy were restored; optional hook/vault
containers, private network and temporary secrets were removed. The ledger role
is NOLOGIN with its password removed; eight replay tombstones remain.

All six core services are healthy with zero restarts. API/worker remain db93880;
the dashboard remains 328f5ad, admin cd3d3ff, marketing/developers 1829289. Public
health/site requests passed. Local encrypted transfer copies were removed after
cleanup. No ongoing auth sender or added paid resource remains from this pilot.

## Acceptance still required

Exact hosted expiry/resend boundaries, authenticated cross-owner Data API checks
and an end-user deletion flow remain
unverified. The initial two-email allowance was exhausted. A subsequent four-email
allowance has now used three sends; one remains unused, with its temporary access retired.
Default Supabase fallback remains link-only and incompatible with Sprout's native
code form. Independent customer setup and unrestricted delivery remain separate
open gates; neither is established by an owner-inbox pilot.

## Evidence references

- Production activation: SSM `8af1cd47-18a8-4230-a34e-5de65ac69d0c`.
- Resumed service/version check: SSM `a27544dd-bb2d-428c-9804-8bd1e9302231`.
- Public routing and denial checks: SSM `567e9bca-4161-41f1-b332-54e16419b1f7`.
- Both-email delivery/content-removal check: SSM `29a38518-886f-48bb-8ff0-da30aae63698`.
- Cleanup: SSM `f01f801e-ecc9-49f1-8d96-1a7775bbb01f`.
- Final health and absent-secret/flag checks: SSM `3a73fc05-c00e-4c48-bac5-997b4117463d`.
- Local hosted test results: `SignedIPhoneSignin-20261102.xcresult`,
  `SignedIPhoneSync-20261102.xcresult`, `SignedReverseSync-20261102.xcresult` in
  `.cache/rootmail-acceptance/20261029/` under the operator home directory.
- Local build/test artifacts: `.cache/rootmail-acceptance/20261028/` under the
  operator home directory. These are local artifacts, not independent CI proof.

No codes, credentials, session payloads or private verification URLs are recorded here.

## Boundary follow-up and retirement — 3 November

The owner authorized four additional owner-inbox messages for resend and expiry.
Two were provider-delivered on 2 November: `msg_r6pdcswhgrnzfxbjx4k2i1kf` at
18:12:05 UTC / 19:12 WAT and `msg_fwekqfezgcxrza0vt21tcxq3` at 18:13:26 UTC /
19:13 WAT. Retained HTML, text and content hashes are null. The owner explicitly
confirmed entering the replacement 19:13 code, which signed in. This establishes
replacement-code acceptance, not superseded-code rejection or expiry enforcement.

The dedicated simulator boundary test failed before its code field appeared,
with “We couldn’t send your code.” No third Rootmail message was recorded. The
Supabase log `88b1bd04-277f-413d-9d89-a979592a6e91` later confirmed HTTP 429 /
`over_email_send_rate_limit` at 18:21:21 UTC, before the hook ran. The test never
reached resend or expiry;
`Boundary-20261102.xcresult` is failed evidence, not a passing security check.

After the pause, the hook was disabled and key XKM6 revoked; HTTP 401 verified.
No auth jobs were pending. Core environment/compose/proxy were restored,
optional hook/vault containers and network removed, temporary secrets and local
encrypted transfer copies removed. Ledger login/password were disabled; ten
replay tombstones remain. All six services are healthy on the same versions.
Cleanup SSM: `78b684c9-6416-481b-baf4-f3bf327a615b`. Health verification:
`6004fb5a-793f-444f-8e13-2c287d156b9f`. Two approved messages remain unused.

The owner nominated admin@rootmail.io as a separate customer setup context.
Read-only inspection found no existing Rootmail account for that address. No
second installation or independent human review has been completed.

## Hosted offline recovery — 3 November

`testHostedOfflineUndoPersistsAndRetries` passed on the independently signed-in
iPhone Simulator. It established a checked baseline for today, relaunched with
an opt-in DEBUG-only URLSession transport that fails requests before network I/O,
undid the disposable check-in, observed “Saved here · sync needs attention,”
terminated and relaunched normally, then reached Up to date with the habit
unchecked. The Mac independently synced and displayed the same unchecked habit.
This observes local-write persistence and recovery through the actual hosted
service; it is not a physical network outage or a lost-response-after-commit test.

The first attempt failed before mutation because its fixture assumed yesterday's
check-in was still checked after midnight. The corrected test establishes today's
baseline through normal UI and passed. `OfflineRetryFixed-20261103.xcresult`
records one test, zero failures/skips. The signed test build passed.

## Hosted conflict resolution — 3 November

The iPhone saved an offline check-in and terminated. The Mac changed the same
habit's cue through normal UI to “Mac conflict acceptance 2 Nov” and reached
Up to date. On normal iPhone relaunch, Sprout displayed “Two versions need your
attention” and disabled Sync now. Choosing Use the account version and confirming
loaded the Mac cue and unchecked state, then reached Up to date. The local account
directory contains one before-conflict backup modified during this resolution;
no credential or backup contents were read for this check.

`PrepareConflict-20261103.xcresult` and `ResolveConflictFixed-20261103.xcresult`
each record one passing test, zero failures/skips. An initial resolution attempt
failed because the choice button was below the visible form; the runner was
corrected to scroll to the existing control. The app's conflict behavior did not
need a runtime fix. This is a real hosted divergent-edit check with local network
fault injection, not a simultaneous network race or physical-device test.

Supabase's rate-limit response exposed misleading generic connection advice.
The local Sprout follow-up maps known email/request rate-limit errors to a fixed
wait message, network failures to connection advice, and all other failures to
a safe generic retry-later message. It never displays raw provider payloads.
This native change remains local and is not a distribution release.

Validation of the rate-limit message and existing account/storage protections:
`AccountAndStorage-20261103.xcresult` passed 11 tests with one intentional opt-in
skip and zero failures. The signed iPhone test build passed. Provider errors are
synthetic in these tests; no email was sent. The two-process synthetic persistence
check had already passed separately; the skip does not claim a new repetition.

## Resumed boundary attempt and cleanup — 3 November

The owner approved using the two remaining messages. One was provider-delivered:
`msg_k8fbkopicujqlj9fd5o17rut`, created at 05:31:40 UTC / 06:31:40 WAT. Retained
HTML, text and content hash are null. `Boundary.xcresult` in the local 20261103
acceptance directory timed out at 05:41 UTC waiting for the first code entry.
No replacement request occurred. This adds delivery evidence, not resend or
expiry acceptance. Three of the four boundary emails have been used; one remains.
The local native Continue button now requires the configured eight digits;
its signed simulator test build passed.

After resumption, Supabase's hook was disabled and key slpK revoked; HTTP 401
verified. No auth sends were pending. Original core environments, compose and
proxy were restored; optional hook/vault containers and network, temporary
secrets and local encrypted transfer artifacts were removed. The ledger is
NOLOGIN with password removed; eleven replay tombstones remain. All six services
are healthy with zero restarts and unchanged images; public checks passed.
Cleanup SSM: `532fe6a1-5026-4e75-8897-398eb4571d1b`. Final health:
`ad1d9361-6d61-4ad0-9640-2b4a4883e139`. No ongoing auth sender remains enabled.

## Hosted commit with discarded acknowledgement — 3 November

Two more opt-in UI tests used the existing independent iPhone session and the
named disposable habit, with no new email or copied credentials. The DEBUG-only
fault requires both an explicit launch argument and owner-only acceptance flag.
It throws a connection-lost error only after the real `habit_sync` response says
accepted, before acknowledgement is saved locally. Normal builds/launches do
not enable it. This deliberately discards a received response; it is not a real
packet-loss or physical-network test.

`testHostedCommitWithLostReply` passed: the check-in was saved locally and the
app displayed “Saved here · sync needs attention,” then terminated. Read-only
non-secret metadata showed baseline revision 8 and a pending request expecting
revision 8. Before retrying the iPhone, the Mac independently requested sync and
showed the same habit checked in, one of one complete. This establishes a hosted
commit independently of the failed local acknowledgement.

`testHostedLostReplyRetryAfterRelaunch` passed: normal iPhone relaunch retained
the authenticated session, retried the pending request, reached Up to date and
completed another manual sync without a conflict. Afterward the pending request
was absent, baseline revision was exactly 9, and there was one QA habit and one
completion for 3 November. The retry did not add another revision or completion.

Both tests passed with zero failures/skips; signed simulator test build and
`git diff --check` passed. Local artifacts under `.cache/rootmail-acceptance/20261103/`:
`LostReply.xcresult`, `LostReplyRetry.xcresult`, `lost-reply-before.json` and
`lost-reply-after.json`. The JSON evidence contains only revision/pending/count
metadata, not sessions, credentials or habit contents. Native changes remain
local in Sprout's shared working tree and are not a distributed app release.
