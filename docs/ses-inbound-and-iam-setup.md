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

## 1b. To let the agent finish the remaining setup

Section 1's policy is applied — the *automation* can now run. What is still
blocked is the *one-time account setup*. Five more actions close that:

```json
{
  "Sid": "OneTimeAccountSetup",
  "Effect": "Allow",
  "Action": [
    "ses:CreateReceiptRuleSet",
    "ses:SetActiveReceiptRuleSet",
    "s3:CreateBucket",
    "s3:PutBucketPolicy",
    "s3:PutLifecycleConfiguration"
  ],
  "Resource": "*"
},
{
  "Sid": "InboundRead",
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::rootmail-inbound-prod/*"
}
```

### What must NOT be granted, and why

**No IAM actions — especially not `iam:PutUserPolicy` on this user.**

A principal that can attach policies to itself can grant itself anything, which
makes it administrator by another name. This key lives in CI and on a laptop;
granting it IAM write turns "CI credential leaked" into "AWS account taken
over". The five actions above are bounded — the worst case is an unwanted
bucket or receipt rule set, both trivially deleted. `iam:PutUserPolicy` has no
worst case.

So the standing line is: the deploy identity may create the resources it needs,
and may never widen its own access. Permission changes stay with a human, which
is why section 1 had to be applied by you and this one does too.

If you would rather not extend the deploy key at all, the alternative is to run
sections 2 and 3 yourself — six commands, all in this file — and leave
`claude-depoy` exactly as it is. That is the more conservative choice and costs
about five minutes.

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

## 3. Inbound delivery — S3 (built)

The translation from SES to our API now exists: an S3-delivered reply is fetched
and parsed in `applySesInbound` (`apps/api/src/lib/ses-events.ts`). Three pieces
of AWS setup remain.

**a. A bucket for inbound mail.**

```bash
aws s3api create-bucket --bucket rootmail-inbound-prod --region us-east-1
```

**b. Let SES write to it.** Save as `inbound-bucket-policy.json` — SES writes as
the service principal, and the `SourceAccount` condition stops any other AWS
account from writing into our bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESPuts",
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::rootmail-inbound-prod/*",
      "Condition": {
        "StringEquals": { "AWS:SourceAccount": "130299713609" }
      }
    }
  ]
}
```

```bash
aws s3api put-bucket-policy --bucket rootmail-inbound-prod --policy file://inbound-bucket-policy.json
```

**c. Let the API read it.** Add to the deploy user's policy from section 1:

```json
{
  "Sid": "InboundRead",
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::rootmail-inbound-prod/*"
}
```

**d. Point the app at it** — in `.env.prod` on the API host:

```
INBOUND_S3_BUCKET=rootmail-inbound-prod
INBOUND_S3_PREFIX=inbound/
```

Set a lifecycle rule to expire objects after ~30 days. The message body is
already stored in the thread once parsed, so the S3 copy is a transit buffer,
not an archive — keeping raw customer mail forever is a liability with no
upside.

## 4. Why S3 rather than SNS

SNS inlines the raw MIME but caps it at ~150KB. The reply that exceeds it is the
one carrying a screenshot of the bug being reported — so the failure lands
exactly on the most valuable message. S3 has no practical limit.

Both shapes stay supported in code: a rule using the SNS action still works.

## Verify afterwards

```bash
aws ses describe-active-receipt-rule-set --query 'Metadata.Name'
```

Then a dedicated-IP purchase or a reply-domain DNS verification will provision
itself and email the customer. Until then both fail closed, leave the customer
on their previous status, and record exactly why.
