# SES case — correction to send (draft)

**Status:** draft for you to review and send as a reply on the existing case.
Send it. A correction you volunteer is worth more than one they find.

**Why this exists:** after submitting, two adversarial reviews — one playing an
AWS reviewer against our public surfaces, one auditing the codebase — found two
statements in the appeal that were not true as written, plus several control
weaknesses. The weaknesses are fixed. The statements need correcting on the
record.

---

## The message

> A correction and an update, both offered proactively.
>
> **Two statements in our previous message were wrong, and I want to correct them
> before you rely on them.**
>
> **1. Per-customer DKIM signing.** We wrote that each customer domain is
> "signed with its own DKIM key". The domain verification, the per-customer
> keypair, and the encryption of that key at rest are all real. The signing is
> not: our sends go through SES with Easy DKIM on our own verified domain, so the
> DKIM `d=` on customer mail is our domain, not theirs. We had built the key
> ceremony without wiring it to the signature, and described the intent rather
> than the behaviour. We are correcting this by provisioning a real SES domain
> identity per customer domain so that Easy DKIM signs as the customer, which we
> would rather do properly than approximate. Until that ships, customer mail is
> DKIM-signed and DMARC-aligned to our domain, and we will not describe it
> otherwise.
>
> **2. Reputation enforcement coverage.** We described per-domain reputation
> scoring and automatic warn/throttle/pause as though it covered all sending. It
> covered only customers using our multi-tenant feature. Ordinary accounts — the
> majority — were not scored. This is now fixed: the same thresholds (warn at 5%
> bounce / 0.1% complaint, throttle at 8% / 0.3%, pause at 10% / 0.5%, minimum 20
> judged sends, seven-day window) apply to every sending account, enforced at
> send time.
>
> **Separately, our own review found and closed five ways a customer could have
> undermined those controls.** We are listing them because a control that can be
> switched off by the account it restrains is not a control:
>
> - Delivery events could be posted by the account itself in production, which
>   could rewrite a bounce as a delivery and clear its own bounce rate. Event
>   simulation is now refused outside our sandbox.
> - Deleting a customer record cascaded away its bounce and complaint
>   suppressions and reset its reputation — a repeatable reset. Suppressions now
>   survive deletion and apply account-wide, and a paused customer cannot be
>   deleted at all.
> - Campaigns accepted any From address without checking it was one the account
>   controls. Because SES identity verification is account-wide, that could have
>   allowed sending as an address a different customer had verified. Both send
>   paths now enforce the same check.
> - Commercial mail could be sent with no physical postal address if the customer
>   left the field blank. Marketing and sales sends are now refused without one,
>   per CAN-SPAM.
> - Our closed-beta daily cap applied only to transactional mail, not marketing.
>   It now applies to both.
>
> **We have also removed automatic dedicated-IP provisioning.** Purchasing that
> add-on previously caused our account to allocate a dedicated IP unattended. It
> now requires a person on our side, who checks the account's actual volume
> first. We should have disclosed that feature in our original request and did
> not.
>
> We would rather you saw all of this from us. Everything else in the original
> request we have re-verified against the running system and it is accurate as
> written. We remain happy to accept the lowest quota you are comfortable
> granting.

---

## Before you send — check these are done

- [ ] `abuse@rootmail.io` exists and reaches a person (the AUP now publishes it)
- [ ] A business postal address appears in the site footer
- [ ] Terms name the incorporated legal entity, not just "rootmail"
- [ ] `_dmarc.rootmail.io` has a `rua=` and ideally `p=quarantine`

The first three were rated blockers in their own right by the reviewer pass —
"no identifiable legal entity, redacted WHOIS, no postal address, domain seven
weeks old" is the profile AWS associates with disposable senders, and it is the
one thing on this list that no amount of engineering answers.

## Do NOT claim in the correction

- Per-customer DKIM signing, until the SES-identity-per-domain work ships.
- Any form of per-customer delivery isolation — all customers still share one IP
  pool and one SES account.
