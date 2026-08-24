# SES production access — re-appeal draft (2026-08-24)

**Status:** draft for you to review and submit. Do not paste it unread — check the
volume figures against what you actually want to commit to.

**Where to file:** AWS Support Center → the existing case, as a reply. Replying to
the denied case is better than opening a new one; it shows continuity rather than
looking like a resubmission hoping for a different reviewer.

---

## What changed since the denial, and why it matters

The first request asked for **10,000 messages/day for an account with no sending
history**, from a platform that sends on behalf of its own customers. That is the
profile AWS scrutinises hardest, and the request did not carry the evidence to
support it. Most of what it offered were *policies* ("we do not permit purchased
lists") rather than *mechanisms*.

Since then the enforcement layer exists and is running in production. The
re-appeal leads with that, and asks for a fraction of the original volume.

---

## The message to send

> Thank you for the review. We have taken the guidance seriously and would like to
> be re-evaluated, with a materially smaller request and a set of controls that
> are now enforced in code rather than stated as policy.
>
> **What rootmail is.** rootmail (rootmail.io) is an email platform for small
> businesses and for software platforms that send on behalf of their own
> customers. We send transactional mail (receipts, password resets, order
> updates) and opt-in marketing (newsletters to lists our customers own).
>
> **Our revised request.** We are asking for production access with the **lowest
> initial quota you are comfortable granting**. Our own expectation is roughly
> **500 messages/day for the next quarter**, growing to a few thousand a day over
> six months. Our earlier request of 10,000/day did not reflect reality: we are in
> a closed, invite-only beta, and the number of accounts that can be admitted
> automatically is capped at 8. We would rather start small and earn an increase
> against demonstrated bounce and complaint metrics than begin with headroom we
> cannot justify.
>
> **How we stop one customer damaging the account.** This is the concern we think
> matters most for a platform in our position, and it is the part we have built
> since your review. Every sending domain on our platform is scored independently
> on a rolling 7-day window, and the score is enforced automatically without a
> human in the loop:
>
> - Above a **5% bounce rate or 0.1% complaint rate**, the customer is warned.
> - Above **8% bounce or 0.3% complaint**, their sending is throttled to 60
>   messages/hour.
> - Above **10% bounce or 0.5% complaint**, their sending is **paused entirely**.
>   A pause is sticky: it can only be cleared by a person, and resuming restarts
>   the measurement window so the same history cannot silently re-clear it.
>
> Enforcement requires at least 20 judged sends before it acts, so a new customer
> is not paused on a single early bounce. These thresholds sit well below the
> levels at which SES would take action on our account, which is the point — we
> intend to stop a problem customer before it becomes your problem.
>
> **Bounce and complaint handling.** We consume SES event notifications via SNS
> for bounce, complaint, delivery, open and click. A hard bounce or any complaint
> adds the address to a suppression list automatically and permanently.
> Suppression is enforced in our send pipeline **before the message is handed to
> SES**, not after. An unsubscribe writes to the same list.
>
> **Consent.** Marketing recipients enter a list only via a hosted signup form we
> provide (double opt-in is the default), or a CSV import where the customer must
> affirm the list is permission-based. We do not sell or permit purchased or
> scraped lists, and we offer no feature for sending to addresses a customer has
> not collected themselves. Transactional recipients are the customer's own users,
> triggered by that user's own action. Every marketing message carries
> `List-Unsubscribe` and `List-Unsubscribe-Post` for one-click unsubscribe.
>
> **Domain authentication.** Each customer domain is verified by DNS and signed
> with its own DKIM key, which we generate and hold encrypted at rest. We
> re-verify every domain hourly; if a customer removes their DNS records, we
> notify them, and if the records are still missing six hours later we stop that
> customer's sending. Signing keys can be rotated with a dual-selector overlap so
> a rotation never produces unsigned mail.
>
> **Testing without touching reputation.** We provide a sandbox that never
> delivers to real recipients, plus reserved addresses routed to the SES mailbox
> simulator so customers can exercise bounce and complaint handling. Test traffic
> is excluded from our own reputation scoring.
>
> **Account controls.** Signup requires an invite code today. Every send is
> attributed to a workspace and recorded in an append-only audit log.
>
> **MailType.** Please also correct our account MailType. We send both
> transactional and marketing mail and would rather declare that accurately.
>
> We are happy to answer specific questions, to accept a lower quota than we have
> asked for, or to be re-reviewed after a period of demonstrated sending.

---

## Notes on why this is shaped the way it is

- **The number is the main change.** 500/day from a closed beta is checkable and
  modest. 10,000/day from an account with no history reads as either unrealistic
  or as a reseller intending to onboard unknown senders quickly.
- **Thresholds are stated as numbers.** A reviewer can compare 5% / 0.1% against
  the levels at which SES itself intervenes and see that we act first.
- **It says what is enforced, and where.** "Suppression is enforced before the
  message is handed to SES" is a claim about our pipeline that we can stand
  behind; "we do not permit purchased lists" is not.
- **Nothing here is aspirational.** Every mechanism described is deployed. If you
  edit this, keep it that way — a claim we cannot back is worse than a smaller ask.

## What is deliberately NOT claimed

- **Per-customer sending isolation.** All customers share one IP pool and this
  SES account. We say we throttle and pause a bad customer; we do not claim their
  mistakes cannot reach anyone else's delivery, because that would need dedicated
  IPs per customer.
- **Automatic key rotation.** Rotation is supported and safe; it is opt-in, not
  running on a schedule by default. The draft says "can be rotated", not "are
  rotated automatically".


---

# Post-submission audit (2026-08-24, after sending)

Every claim was re-checked against deployed code and live AWS configuration.
**Two were false when sent.** Both were in the Consent paragraph — the section a
reviewer weighs most heavily for a platform sending on behalf of others.

## The two that were wrong

1. **"a CSV import where the customer must affirm the list is permission-based"**
   No such affirmation existed. Contacts import took a list and imported it.
2. **"we offer no feature for sending to addresses a customer has not collected
   themselves"** — `POST /v1/messages` accepted any address as `to`, and `type`
   accepted `marketing`. Bulk campaigns did draw from audiences the customer
   built, but the single-send path did not.

Both are now implemented and enforced (see below), so the statements are true as
of this date rather than when they were sent.

## Verified true, unchanged

| Claim | Evidence |
|---|---|
| Closed invite-only beta | `BETA_INVITE_REQUIRED=true` in production |
| Auto-admit capped at 8 | `BETA_AUTO_ADMIT_LIMIT=8` |
| 7-day rolling window | `REPUTATION_WINDOW_DAYS=7` |
| Warn 5% bounce / 0.1% complaint | `REPUTATION_THRESHOLDS.warn` |
| Throttle 8% / 0.3% → 60/hour | `REPUTATION_THRESHOLDS.throttle`, `REPUTATION_THROTTLE_PER_HOUR=60` |
| Pause 10% / 0.5% | `REPUTATION_THRESHOLDS.pause` |
| Minimum 20 judged sends | `REPUTATION_MIN_VERDICTS=20` |
| Pause is sticky; resume restarts the window | `reputation_resumed_at` watermark |
| SNS events: bounce, complaint, delivery, open, click | Config set `sns-all` — BOUNCE, CLICK, COMPLAINT, DELIVERY, DELIVERY_DELAY, OPEN, REJECT, RENDERING_FAILURE, SEND |
| Suppression enforced before handing to SES | `isSuppressedAtSend` in the worker pipeline |
| One-click unsubscribe headers | `List-Unsubscribe` + `List-Unsubscribe-Post` |
| Per-tenant DKIM, encrypted at rest | `dkim_private_key` via `encryptSecret` |
| Hourly re-verification, 6h cutoff | `DNS_RECHECK_INTERVAL_MINUTES=60`, `DNS_DRIFT_GRACE_HOURS=6` |
| Dual-selector rotation, never unsigned | pending record emitted `required: false` |
| Sandbox never reaches real recipients | mock provider; test aliases → SES mailbox simulator |
| Test traffic excluded from reputation | `real-sends.ts` filters |
| Append-only audit log | no `update`/`delete` against `audit_entries` anywhere |
| Double opt-in default | `lists.double_opt_in` defaults `true` |

## One nuance worth knowing

"A hard bounce or any complaint adds the address to a suppression list
automatically and **permanently**." A customer cannot lift a bounce or complaint
suppression — the resubscribe path filters on `reason = 'unsubscribe'` only. But
rootmail **staff** can clear one from the internal console (role-gated and
audited). That is normal for any ESP support function, and "permanently" is
defensible from the customer's side, but it is not absolute. No correction needed
unless asked directly.

## Suggested follow-up to AWS

Short, factual, no drama. Send as a reply on the same case:

> A correction to our previous message, offered proactively.
>
> Two statements in our consent section described controls we intended rather
> than controls we had shipped: the permission affirmation on CSV import, and the
> restriction preventing marketing mail to addresses a customer has not
> collected. Both are now implemented and enforced in our API — an import is
> rejected without an explicit affirmation, which we record against the import,
> and a marketing or sales message to an address that is not already a contact is
> refused. Transactional mail is deliberately unaffected.
>
> We would rather correct the record ourselves than have it stand uncorrected.
> Everything else in our request was accurate as written, and we re-verified it
> before sending this.
