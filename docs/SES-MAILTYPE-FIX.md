# Correct the declared MailType (owner action)

The account currently declares **`MailType: TRANSACTIONAL`** while rootmail.io
publicly sells campaigns, audiences, newsletters and sequences. AWS reviews the
website against the declaration, so that is a visible contradiction sitting in
the record they read. Both appeals asked them to change it; it was never changed.

`MARKETING` is the honest declaration for an account that sends both — it is the
stricter of the two, and it matches what the site says.

## Option A — one command (fastest)

Run with credentials that can call `ses:PutAccountDetails`. Your own root/admin
identity can; the `claude-depoy` user cannot.

```bash
aws sesv2 put-account-details --region us-east-1 \
  --mail-type MARKETING \
  --website-url https://rootmail.io \
  --contact-language EN \
  --additional-contact-email-addresses admin@rootmail.io \
  --use-case-description "rootmail is an email platform for small businesses and for software platforms that send on behalf of their own customers. We send transactional mail (receipts, password resets, order updates) and opt-in marketing (newsletters to lists our customers own). Marketing recipients enter a list only via our hosted signup form with double opt-in, or a CSV import that requires an explicit permission affirmation which we record. Marketing and sales mail to an address the sender has not collected is refused. Hard bounces and complaints suppress the address automatically and permanently, enforced before the message reaches SES. Every sending account is scored on bounce and complaint rates over a rolling 7 days and automatically warned, throttled, then paused. We are in a closed invite-only beta with a hard cap of 12 sends per account per day."
```

## Option B — the console

SES → Account dashboard → **Edit** next to "Account details" → set Mail type to
**Marketing**, confirm the website URL is `https://rootmail.io`, and paste the
use-case description above.

## If you would rather I could do it

Add this to the `SESSetup` inline policy on `claude-depoy`. It is account-scoped
because `PutAccountDetails` has no resource ARN:

```json
{
  "Sid": "AccountDetails",
  "Effect": "Allow",
  "Action": ["ses:PutAccountDetails", "ses:GetAccount"],
  "Resource": "*"
}
```

`ses:DeleteEmailIdentity` is still missing too, and now matters: every client
domain becomes an SES identity, and without it a removed client's domain stays
registered against your account forever, counting toward the 10,000 limit.

```json
{
  "Sid": "IdentityCleanup",
  "Effect": "Allow",
  "Action": ["ses:DeleteEmailIdentity"],
  "Resource": "*"
}
```

## Verify it took

```bash
aws sesv2 get-account --region us-east-1 --query 'Details.MailType' --output text
```

Should print `MARKETING`.
