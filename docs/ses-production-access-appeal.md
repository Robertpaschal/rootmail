# SES production access — appeal draft

**Previous case:** 178644854200045 — DENIED
**Account:** 130299713609 · us-east-1 · sending domain `rootmail.io` (DKIM verified)
**Current state:** sandbox, 200 msg/day, 1 msg/sec, enforcement status HEALTHY

## Why the first request was likely denied

Read the denial as a question we failed to answer, not a verdict. AWS declines when
it cannot tell **whose** mail we will send and **how recipients asked for it**. An
ESP is the hardest case for them: we are asking to send on behalf of people they
have never met. A generic "transactional email platform" description gets refused
almost by default.

Two things also worked against us: `MailType` was declared **TRANSACTIONAL** while
the product plainly also sends marketing campaigns (a mismatch AWS checks), and we
had ~zero sending history to point at.

## What to file (paste into the case, edit the numbers to taste)

> rootmail (rootmail.io) is an email platform for small businesses. We send two
> kinds of mail on behalf of our customers, and we would like production access
> for both: transactional messages (receipts, password resets, order updates) and
> opt-in marketing (newsletters and announcements to lists our customers own).
>
> **How recipients opt in.** Marketing recipients enter our customers' lists in
> one of three ways only: a hosted signup form we provide, a double opt-in
> confirmation link, or a CSV import where the customer must affirm the list is
> permission-based. We do not permit purchased or scraped lists, and we do not
> offer any "email anyone" feature. Transactional recipients are the customer's
> own users, triggered by that user's own action.
>
> **How we handle bounces and complaints.** We consume SES event notifications via
> SNS for BOUNCE, COMPLAINT, DELIVERY, DELIVERY_DELAY, REJECT and
> RENDERING_FAILURE. A hard bounce or any complaint adds the address to a
> per-workspace suppression list automatically and permanently; suppressed
> addresses are excluded from every subsequent send at the queue level, before
> the message reaches SES. This is already built and running — it is not a plan.
>
> **Unsubscribes.** Every marketing message carries a List-Unsubscribe header and
> a one-click unsubscribe link. Unsubscribes are written to the same suppression
> list, so an opt-out applies across the customer's entire account, including any
> future campaign or sequence.
>
> **How we prevent abuse of the platform itself.** Accounts are invite-only today
> (closed beta). New accounts begin on a low sending allowance. We operate a
> sandbox environment for integration testing that never delivers to real
> recipients, plus a set of test addresses routed to the SES mailbox simulator, so
> customers can exercise bounce and complaint handling without touching live
> reputation. Every send is attributed to a workspace and retained in an
> append-only audit log.
>
> **Volume.** We expect to start at roughly [N] messages/day and grow to [M]/day
> over the next six months. We are requesting a starting quota appropriate to
> that, and are happy to begin lower.
>
> Our sending domain rootmail.io is verified with DKIM. We would also like to
> correct our account MailType: the platform sends both transactional and
> marketing mail, and we would rather declare that accurately than under-declare.

## Before you file

1. **Fix the MailType mismatch.** Set it accurately rather than leaving
   TRANSACTIONAL — an inconsistency here is a cheap reason to decline:
   ```bash
   aws sesv2 put-account-details --mail-type MARKETING --website-url https://rootmail.io --use-case-description "Transactional and opt-in marketing email for small businesses" --additional-contact-email-addresses admin@rootmail.io --contact-language EN
   ```
   (`put-account-details` is also how the appeal gets attached — AWS re-reviews on
   submission.)
2. **Have something to point at.** A denial after zero sending is common; a few
   weeks of clean sandbox history, real DKIM, and a live site all help.
3. **Fill in [N] and [M].** Vague volume reads as unplanned. Under-promise — the
   quota is raised on request later, and asking small is easier to approve.

## What is blocked until this lands

- Beta invites can only reach `@rootmail.io` addresses, so no external tester can
  actually receive a code.
- Dedicated IPs are pointless on a sandboxed account (and cost money monthly).
- Branded reply domains still need an SES receipt rule set, which is separate —
  see below.

## Separate, and not blocked by this

Inbound reply capture is **not configured in this account**:
`aws ses list-receipt-rule-sets` returns `[]`. Branded reply domains cannot work
until an active receipt rule set exists, regardless of production access. That is
a one-time setup, plus these IAM permissions on the deploy user for the automation
to run:

```
ses:DescribeActiveReceiptRuleSet
ses:CreateReceiptRule
sesv2:CreateDedicatedIpPool
sesv2:CreateConfigurationSet
sesv2:CreateConfigurationSetEventDestination
sesv2:GetConfigurationSetEventDestinations
```
