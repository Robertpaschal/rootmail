# DMARC for rootmail.io — the change, ready to run

**Why:** `_dmarc.rootmail.io` is `v=DMARC1; p=none;` — monitor-only, with no
reporting address, so nobody is even collecting the reports. For a platform that
sells deliverability guidance and nudges customers from `none` → `quarantine` →
`reject`, that is the one thing a technical reviewer checks in a single `dig`.

**Why you and not me:** the deploy identity (`claude-depoy`) has no Route53
permissions, and I will not widen my own access.

---

## Step 1 — make sure `dmarc@rootmail.io` receives mail

A `rua=` pointing at a mailbox that bounces collects nothing. It is a Google
Workspace alias; same job as the `abuse@` alias. Do this first.

## Step 2 — publish the record

Find the zone id:

```bash
AWS_PROFILE=rootmail-prod aws route53 list-hosted-zones-by-name --dns-name rootmail.io --query 'HostedZones[0].Id' --output text
```

Then apply (substitute the zone id):

```bash
AWS_PROFILE=rootmail-prod aws route53 change-resource-record-sets --hosted-zone-id ZONEID --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"_dmarc.rootmail.io","Type":"TXT","TTL":300,"ResourceRecords":[{"Value":"\"v=DMARC1; p=none; rua=mailto:dmarc@rootmail.io; fo=1\""}]}}]}'
```

Confirm:

```bash
dig +short TXT _dmarc.rootmail.io
```

## Step 3 — a week later, enforce

Once the aggregate reports show your own mail passing (Google Workspace and SES
are both aligned already — SES signs with Easy DKIM on `rootmail.io` and uses
`mail.rootmail.io` as its MAIL FROM), move to enforcement:

```
v=DMARC1; p=quarantine; rua=mailto:dmarc@rootmail.io; fo=1; pct=100
```

Going to `p=quarantine` before reading a week of reports risks quarantining your
own mail if some path is unaligned — which is exactly the mistake the product
warns customers about, so it would be a poor one to make here.

---

## If you would rather I did it

Add Route53 permissions for the hosted zone to `claude-depoy`:

```json
{
  "Effect": "Allow",
  "Action": ["route53:ListHostedZonesByName", "route53:ListHostedZones", "route53:GetChange", "route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"],
  "Resource": ["arn:aws:route53:::hostedzone/*", "arn:aws:route53:::change/*"]
}
```

## Two other AWS items while you are in there

1. **`ses:DeleteEmailIdentity` is missing.** We now create an SES domain identity
   per customer sending domain, and cannot delete one when a customer is
   removed — so identities accumulate against the 10,000-per-account limit and a
   removed customer's domain stays registered to us. Add it alongside the
   `ses:CreateEmailIdentity` we already have.
2. **One stranded test identity.** `dkimtest-1787578086.rootmail.io` — created
   while proving the new flow works, and I could not delete it for the reason
   above. Harmless (a subdomain of our own domain, never verified, nothing points
   at it), but worth removing.
