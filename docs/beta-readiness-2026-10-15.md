# Beta readiness audit — 15 October 2026

## Verdict

The **core journey passed for a small, controlled beta**. All six production
services now run `182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1` (PR #43), released
15 October at 22:58–22:59 WAT. Fresh signup acceptance below was observed on
the predecessor `b2d448b`; the post-release canary and reply evidence is separate.

The fresh, owner-approved live test passed the public waitlist form, Amazon
verification, automatic invitation, owner-completed password signup, Rootmail
email confirmation, onboarding, beta sender activation, live delivery and reply
capture. This is not exhaustive acceptance of every product surface or a claim
of unrestricted sending, high availability, peak-load capacity or restore readiness.

## Findings and fixes

- The original reported missing-verification-email test used an existing,
  verified user and sender, not a fresh applicant. Read-only inspection confirmed
  the SES identity was already verified. No identity was reset or deleted.
- The resend response incorrectly suggested another email was on its way even
  when the service deliberately did nothing. Updated neutral guidance tells
  already-confirmed users to look for their invite or sign in. Responses remain
  identical across account states; no account enumeration was introduced.
- The beta sender migration test scanned the default platform domain shared by
  parallel suites. It could move a different suite's sender between assertions,
  causing an intermittent 422 when that suite disabled inbound capture. Its
  process now uses a unique fixture domain; production migration code is unchanged.
- Added a regression proving verified/protected resend requests receive identical
  guidance and trigger no SES writes.

## Verification

| Check | Result |
| --- | --- |
| Automated tests | 380 passed: core 133, database 51, API 144, worker 9, dashboard 43 |
| Repeated full-suite runs | Passed after fixture isolation |
| Deployment/canary/reserved-mailbox regressions | 15 passed |
| Concurrent quota test | Passed; hard cap held atomically |
| Typecheck | 13/13 tasks |
| Build | 6/6 tasks |
| SDK end-to-end smoke | 36 passed, 0 failed; mock mail only |
| Design/truthfulness audit | Zero blocking violations |
| Placeholder-link check | Passed across four apps |
| Local public SEO validation | Passed; 27 prerendered docs, canonicals, robots, sitemaps |
| Public production probe | 28 pages, 13 assets, two private noindex login pages, sitemap 200 |
| Production readiness | API, PostgreSQL, cache and beta-invite readiness healthy |

Local integration checks used isolated PostgreSQL 18 and Valkey 7.2 containers;
no real mail was sent by local services. AWS calls in relevant unit tests were
intercepted by mocks. The live signup was performed through the public UI with
the owner's explicitly approved fresh alias.

Amazon's verification message arrived at 03:54:55 WAT on 15 October; its link
showed Verification Successful. The automatic Rootmail invitation arrived at
03:58:00 WAT. Gmail reported SPF, DKIM and DMARC passes, a captured Reply-To and
no List-Unsubscribe header. Private tokens, recipient details and passwords are
intentionally excluded from this file.

The labelled transactional test arrived in Gmail at **07:21:56 WAT** with SPF,
DKIM and DMARC passing. The production message record showed provider-confirmed
delivery and correctly described the open as inferred. A reply to the actual
Reply-To was captured at approximately **07:22 WAT**, in the original conversation,
with the true replying address distinguished from the recipient's plus-alias.

- Message: `msg_mo5d86nihfrwxm9ldq8aybla`
- Conversation: `thr_enkfqkvsvu2pg8nxh5j8uvn8`

Onboarding's mandatory postal fields used clearly labelled QA fixture data, not
a real business address. No marketing or sales campaign was sent. The test
account remains for inspection and occupies one beta seat; exclude it from
recruitment counts. The capacity endpoint reported four of eight seats available
after this run (not a count of external active testers).

## Configs touched

No production configuration, IAM, DNS, database schema or provider settings.
Only a test-process ROOTMAIL_DOMAIN override, restored during teardown. Local
mock-test connection settings target disposable fixtures.

## Prod behaviour preserved

The deployed changes preserve signup admission, sender
protection, resend cooldowns, rate limits, identity handling, queue behaviour,
tracking, reply routing, navigation and the four-state rendering law. Only
public guidance and test-fixture isolation change.

## Remaining follow-ups

1. Release complete: the copy and test-isolation fixes passed exact-main CI,
   guarded deployment and post-release checks detailed below.
2. Retire the temporary beta fixture with the
   appropriate approval; it must not count as an externally recruited tester.
3. The separately recorded invitation-reply/internal-inbox check and broader
   authenticated admin/support/AI workflows were not retested in this run.

SES remains sandboxed (200/day, 1/second); this audit is for a small controlled
beta, not unrestricted sending or peak-load readiness. The health-alert email's
subscription confirmation could not be rechecked because the deployment user
cannot list SNS subscriptions. Receipt of an email is not itself confirmation.

## Record of work

[Notion audit and current acceptance gates](https://app.notion.com/p/3fa2db0e869181e998d0f846765a304a)

The Rootmail hub, active beta task and earlier missing-email report were updated
without erasing their historical observations.

## Released version and cleanup — 15–16 October

- [PR #43](https://github.com/Robertpaschal/rootmail/pull/43) merged as
  `182928943604ddb3eb4ba79ec48fc0ae3a6fb7a1`.
- [Exact-main CI](https://github.com/Robertpaschal/rootmail/actions/runs/38693440175)
  and [all six multi-architecture images](https://github.com/Robertpaschal/rootmail/actions/runs/38693759378)
  passed before deployment. Host scripts/base compose matched the reviewed source;
  protected env files and the host overlay were preserved.
- The first canary stopped before replacement because the approved Gmail inbox
  was not yet registered in the new QA workspace. It sent nothing. Registering it
  through Testing confirmed its existing SES identity; no safeguard was bypassed.
- Isolated API delivery: `msg_2d6e1c47ekq8f3s48ul10yuf`, received 22:57:59 WAT.
- Post-swap worker delivery: `msg_tdzxwj7pl2rgploexvli2x0a`, received 22:58:29 WAT.
  Gmail reported SPF/DKIM/DMARC PASS; tracked links and pixel were present.
- A reply to the actual captured Reply-To appeared in the original conversation
  `thr_i21k7vluutd5a1d9l2fv45hf`, with two emails and the expected test marker.
- API/worker released through the canary path; marketing/dashboard/admin/developers
  followed individually through the guarded script. All six exact image IDs
  matched, healthy with zero restarts. Completion: 22:59:30 WAT, 15 October.
  A subsequent 16 October check found all six still healthy after about six hours.
- Post-release public probe passed: 28 pages, 13 static assets, two private
  noindex login pages and the marketing sitemap. API, PostgreSQL, cache and beta
  invitation readiness reported OK. Old images remain pinned for rollback.
- Temporary QA key revocation was completed at 04:29:45 WAT on 16 October after
  browser confirmation controls failed and the session paused. The authorized
  revocation targeted only that exact QA key; a subsequent request returned 401.
  Its local secret copy was removed. The canary's transient auth file/network
  were cleaned up; test account and message history remain for inspection.
- Extra UI spot checks observed the New menu above navigation, a collapsed AI
  conversation rail with its reopen control, and the support empty-state/thread
  controls. This is not a completed support-resolution or AI-response test.

No extra AWS resources, IAM grants, DNS changes, paid plans or provider changes
were introduced by this release. SES sandbox restrictions still apply.
