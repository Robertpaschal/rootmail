# Closed-beta readiness — 5 September 2026

## What testers can use

The beta is a small, real email-workflow pilot, not unrestricted customer sending.
Testers can prepare reusable templates, organise audiences, draft campaigns and
sequences, send to confirmed personal/team inboxes, and inspect message records
and replies. These assets remain in the same workspace after sending access expands.

On Rootmail's SES sandbox route, each real recipient must be registered in
**Testing → Test inboxes** and confirmed by AWS. Rootmail login verification and
sending-address verification are separate checks. The composer links directly to
both setup steps. A verified sending address alone does not unlock arbitrary recipients.

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

- 183 tests pass (115 core, 27 database, 41 API), including 11 focused beta checks;
  typecheck, build, design audit and placeholder-link check pass.
- Actual beta provisioning, including OAuth; pending is never assumed verified.
- AWS requests intercepted in tests; no real verification or delivery messages sent.
- Recipient confirmation, unavailable-provider reporting, workspace isolation,
  campaign preflight, and worker refusal after recipient removal.
- Beta-invite promotion records the same observed confirmation used by the guard;
  older ready testers are repaired without triggering their invite again.
- Starter audience repair preserves contacts and opt-outs; AI credit allowance
  agrees between Billing and Assistant.
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

This change has not been merged or deployed. Review and deploy API, worker, and
dashboard together; see `deploy-runbook.md`. Do not deploy only the dashboard.
No schema migration is required by this change.

Before inviting the cohort, use an authorised tester inbox to verify the deployed
AWS confirmation email, actual send, provider event, message record, and reply
round trip. Confirm the deployed SES region, IAM identity permissions, sender,
event destination, and inbound reply setup. Check the same journey for an older
admitted tester. Do not describe the beta as launch-ready until that check passes.

SES production access is not required for this limited pilot. It is required for
unrestricted recipients on Rootmail's SES route. AWS sandbox limits also apply
across the shared account, separately from per-organisation Rootmail allowances:
[AWS sandbox restrictions](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
