# SES inbound + IAM setup (owner-only)

Two one-time pieces of AWS setup the provisioning automation needs. Neither can
be done by the deploy user — `claude-depoy` has no IAM permissions at all (it
cannot even list its own policies), which is the right posture for a deploy
identity: it means a compromised deploy key cannot widen its own access.

Account `130299713609`, region `us-east-1`.

---

## 1. IAM — grant the deploy user the provisioning actions

Minimal policy. Six actions, nothing wildcarded, no IAM rights of its own.

Save as `rootmail-provisioning-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DedicatedIpProvisioning",
      "Effect": "Allow",
      "Action": [
        "ses:CreateDedicatedIpPool",
        "ses:CreateConfigurationSet",
        "ses:CreateConfigurationSetEventDestination",
        "ses:GetConfigurationSetEventDestinations"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ReplyDomainProvisioning",
      "Effect": "Allow",
      "Action": [
        "ses:DescribeActiveReceiptRuleSet",
        "ses:CreateReceiptRule"
      ],
      "Resource": "*"
    }
  ]
}
```

> The SESv2 API authorizes under the `ses:` prefix — there is no `sesv2:`
> namespace. Writing `sesv2:CreateDedicatedIpPool` produces a policy that looks
> right, attaches cleanly, and grants nothing. (My earlier note listing
> `sesv2:` prefixes was wrong; this file is correct.)

Attach it:

```bash
aws iam put-user-policy --user-name claude-depoy --policy-name rootmail-provisioning --policy-document file://rootmail-provisioning-policy.json
```

Deliberately **not** included: `ses:CreateReceiptRuleSet` and
`ses:SetActiveReceiptRuleSet`. Creating and activating a rule set changes how
*all* inbound mail routes for the account; that stays a human action. The
automation only ever adds one narrowly-scoped rule to whatever set is already
active.

---

## 2. SES inbound — create and activate a receipt rule set

`aws ses list-receipt-rule-sets` currently returns `[]`, so inbound reply
capture is not configured in this account at all. Branded reply domains cannot
work until this exists — independent of production access.

```bash
aws ses create-receipt-rule-set --rule-set-name rootmail-inbound
```

```bash
aws ses set-active-receipt-rule-set --rule-set-name rootmail-inbound
```

Activating an empty rule set is behaviourally a no-op — no MX record points at
SES inbound yet, and the set contains no rules — so it is safe to run before
anything else is ready.

---

## 3. The gap this exposes — decide before wiring customers up

`POST /v1/inbound` (`apps/api/src/routes/threads.ts:311`) accepts **normalized
JSON**: `{ from, to, subject, text, html }`. SES does not send that. It delivers
either a raw MIME blob to S3, or an SNS notification wrapping the raw message.

So a translation step is missing between SES and our API, and it does not exist
in any environment. Two options:

**SNS action → subscription → our API.** Simplest: one topic, an HTTPS
subscription pointing at a new endpoint that parses the raw MIME and forwards
to the existing inbound logic. Limit: SNS caps the message at ~150 KB, so a
reply with a photo attached is silently truncated or dropped.

**S3 action → notification → fetch and parse.** Robust: SES writes the full
message to S3 (no practical size limit), we parse it on notification. More
moving parts, and it needs a bucket with an SES-write policy.

Recommendation: **S3**. Replies carry attachments — a customer forwarding a
screenshot of the bug they are reporting is exactly the case that breaks under
SNS, and it would break silently. `INBOUND_S3_BUCKET` / `INBOUND_S3_PREFIX` are
already read by the provisioning code; `INBOUND_SNS_TOPIC_ARN` is there as the
simpler fallback.

Either way a MIME parser is needed (`mailparser` or similar) plus a small
endpoint. That work is not written yet — flagging it rather than leaving you to
discover it when the first reply vanishes.

---

## Verify afterwards

```bash
aws ses describe-active-receipt-rule-set --query 'Metadata.Name'
```

Then a dedicated-IP purchase or a reply-domain DNS verification will provision
itself and email the customer. Until then both fail closed, leave the customer
on their previous status, and record exactly why.
