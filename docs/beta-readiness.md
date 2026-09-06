# Closed-beta readiness — 6 September 2026

## What testers can use

The beta is a small, real email-workflow pilot, not unrestricted customer sending.
Testers can prepare reusable templates, organise audiences, draft campaigns and
sequences, send to confirmed personal/team inboxes, and inspect message records
and replies. These assets remain in the same workspace after sending access expands.

On Rootmail's SES sandbox route, each real recipient must be registered in
**Testing → Test inboxes** and confirmed by AWS. Rootmail login verification and
sending-address verification are separate checks. The composer links directly to
both setup steps. A verified sending address alone does not unlock arbitrary recipients.

The follow-up release adds **Settings → Sending → Use beta address** for beta
accounts using Rootmail's SES route in Production. It assigns an org-owned address
on Rootmail's authenticated domain after checking live SES verification and DKIM
signing. It becomes the default; existing senders and drafts remain. Its replies
always route into Rootmail (unless an API caller explicitly supplies Reply-To).
This removes the DNS setup requirement for a first useful test without pretending
that a Gmail/Outlook sender verified by email has authenticated that public domain.
Personal-mailbox From addresses carry a warning in setup and the composer.

The beta audience combines the tester's inbox with recognised delivery, bounce,
and complaint scenario aliases. Keep that audience separate from customers.
Simulator outcomes exercise event handling; they are not evidence of inbox
placement, human engagement, or organic production use. Existing testers can use
**Prepare beta audience** to repair older starter kits without erasing contact
history, resetting opt-outs, or overwriting custom audience descriptions.

An active connected SES or Mailgun account uses that provider's access and rules.
It does not remove Rootmail's account allowances. The billing note reads actual
transactional and marketing daily counters rather than assuming one combined cap.
The separate application sandbox simulates ordinary mail; branded delivery
scenarios use the configured provider path.

## Local verification

- 190 tests pass (115 core, 27 database, 48 API), including 18 focused beta checks;
  typecheck, build, design audit and placeholder-link check pass.
- Actual beta provisioning, including OAuth; pending is never assumed verified.
- AWS requests intercepted in tests; no real verification or delivery messages sent.
- Recipient confirmation, unavailable-provider reporting, workspace isolation,
  campaign preflight, and worker refusal after recipient removal.
- Beta-invite promotion records the same observed confirmation used by the guard;
  older ready testers are repaired without triggering their invite again.
- Starter audience repair preserves contacts and opt-outs; AI credit allowance
  agrees between Billing and Assistant.
- Managed sender activation checks actual DKIM signing, eligibility and inbound
  configuration; concurrent activation is idempotent and cross-org use is refused.
- Concurrent API/worker observations produce one outbound entry, later inbound
  replies retain Needs reply, and old duplicate rows are preserved but not repeated.
- Browser: confirmation request → pending → mocked confirmed → pre-addressed
  composer; audience repair; sender-setup recovery link; mobile create, workspace,
  and account menus; desktop and 320/390px layouts in both themes.
- New sending-access link contrast measured at 16.59:1 light and 14.38:1 dark.

Run tests against local services with an explicit mock boundary. Turbo's strict
environment mode otherwise strips local connection overrides:

```sh
DATABASE_URL=postgres://rootmail:rootmail@127.0.0.1:5435/rootmail REDIS_URL=redis://127.0.0.1:6380 MAIL_PROVIDER=mock DNS_VERIFY_MODE=mock pnpm exec turbo run test --env-mode=loose
pnpm typecheck
pnpm build
pnpm exec tsx scripts/design-audit.ts
bash scripts/check-dead-links.sh
```

Do not run a mail worker against the local `.env`: its provider is SES. Stop the
dashboard development/preview server before building into the same `.next` directory.

## Release gate — not established by local tests

The original repairs shipped in PR #7 at d802c55. A live authorised Gmail test
confirmed recipient setup, one send, a provider delivery event and reply ingestion.
Gmail put that message in Spam: From was gmail.com while Gmail showed amazonses.com
signing. This observation does not prove the exact filtering cause.

PR #8 is deployed at `1f1d8ac35a3696b5aa0d02c7c1ae9f3900d3da1c`. It adds the
authenticated beta sender, corrects the false inbox-placement statement, prevents
duplicate outbound conversation entries, collapses historic duplicate entries on
read without deleting stored history, and labels inbound context honestly. Review
and deploy API, worker and dashboard together; see `deploy-runbook.md`. No schema
migration is required.

### Observed production result — 6 September

The authorised [authenticated test](https://app.rootmail.io/messages/msg_4weober38vommxmvyxxpq1g4)
was accepted at 04:53 UTC. Gmail labelled it **Inbox**, without manual movement or
spam reclassification. Gmail details show **signed-by rootmail.io** and
**mailed-by mail.rootmail.io**, with the expected conversation Reply-To. A labelled
Gmail reply appears in the [same thread](https://app.rootmail.io/inbox/thr_c9e85hi2a9mj4gzn57e9gc56):
exactly one outbound and one inbound entry, with Needs reply. The old test thread
also displays its two genuine emails without deleting the historic duplicate row.

This proves one authenticated Gmail round trip, not a general inbox-placement rate.
The signed-in sender/composer screens were walked at desktop and mobile sizes;
sender setup was checked in both themes. A mobile deep-link issue found during
the walkthrough is repaired in the follow-up: open the requested subject directly,
not the contact list or another subject needing attention. Deploy that dashboard
follow-up and verify both the old and new thread links before closing the gate.

### Cohort operating boundary

Start with a small, individually onboarded cohort (for example five testers), not
a public launch. Each tester should activate a beta address, confirm their own
inbox, save a reusable template, send one email and reply to it. They can then
organise test audiences and draft campaigns/sequences. Do not upload or send to
unconfirmed customer lists on the shared SES route. Account-wide AWS limits are
200 messages per 24 hours and 1 per second, including all organisations and system
mail; Rootmail allowances are separate. Stop expanding the cohort if activation,
confirmation, sending or reply capture fails, and collect feedback through the
dashboard support entry. No cohort invitations were sent during verification.

Before inviting the cohort, use an authorised tester inbox to verify the deployed
AWS confirmation email, actual send, provider event, message record, and reply
round trip. Confirm the deployed SES region, IAM identity permissions, sender,
event destination, and inbound reply setup. Check the same journey for an older
admitted tester. Do not describe the beta as launch-ready until that check passes.

SES production access is not required for this limited pilot. It is required for
unrestricted recipients on Rootmail's SES route. AWS sandbox limits also apply
across the shared account, separately from per-organisation Rootmail allowances:
[AWS sandbox restrictions](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
