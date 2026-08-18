# Brief 2 — the next tranche, argued

**18 Aug, after `afad1fc` and `d2c64ab`.** The first brief was a defect list. This one
is a case. Push back on any of it in `docs/COLLAB.md` — several of these are judgement
calls, not defects, and you can see things from inside the code that I cannot.

---

## 1. The onboarding cliff is the real competitor  ★ strongest case

The marketing page says setup is *"no technical back-and-forth beyond pasting a few
settings."* I think that sentence contains the whole problem.

Our buyer is a booking platform for salons, a CRM for consultants, a clinic system.
**Their** customer is a salon owner. When our flow says "add the client's web address,
then have them paste four DNS records," the platform operator has to go ask a salon
owner to edit DNS. That is not a small ask — it is the ask most of them cannot make.

So the operator does one of three things: they do it themselves over a support call
(expensive, and now they own the customer's DNS), they skip per-client domains and send
everything from their own (which is exactly the reputation-inheritance disaster we sell
against), or they don't onboard that customer at all.

Every hour of engineering spent making per-tenant reputation better is wasted on the
customers who never got through DNS setup.

**Proposal: hosted sending subdomains.** Offer `<client>.mail.<platform-domain>` — the
platform delegates one subdomain to us **once**, via a single `NS` or CNAME record they
control themselves, and every client after that is provisioned with zero DNS work by
anyone. Keep the bring-your-own-domain path for clients who want their own envelope.

- Reputation stays per-client, because reputation is keyed on the sending identity, not
  on who owns the registrar account.
- It turns an N-customer DNS problem into a one-time platform setup.
- It is a claim no competitor makes: **"onboard a client in a minute, without asking
  them to touch DNS."**

I do not know what this costs inside the current DNS verification model, and the
delegation UX has real edge cases (subdomain collisions, what happens on offboarding,
whether DMARC alignment still behaves). **You should tell me if this is a week or a
month, and whether I have missed a reason it cannot work.**

---

## 2. "Why did this one message fail?" — the answer the operator has to give

We give the platform a per-client score. Useful. But the operator's actual daily job is
answering *their* customer: *"my client says they never got the booking confirmation."*

Today that means the operator reads a status and a bounce code and translates. Everything
needed to answer properly already exists — audit entries, the content hash, provider
message id, suppression reason, per-tenant reputation state, the signed proof bundle.

**Proposal: one endpoint and one dashboard view that answers the question in plain
English, and is forwardable.** "Delivered to the provider at 14:32, accepted, then bounced
as a hard failure — the address does not exist. Suppressed so it will not be retried."
Or: "Held — this client is throttled after a complaint rate of 0.6%. It will send in the
next window."

This is small relative to its value, it is built almost entirely on existing data, and
it directly reduces the grief the buyer named. It also demos better than a score.

---

## 3. Silent DNS drift is the failure our buyer fears most

Verification is one-shot. A client rotates their DNS provider, drops the DKIM record, and
nothing re-checks. `lastCheckedAt` exists and nothing updates it.

The mail keeps sending and quietly stops authenticating. Deliverability decays over days.
By the time it shows up in the reputation score, the damage is done — and this is
precisely the *"silently failing long before anything looks wrong"* shape.

The 15-minute sweep from `d2c64ab` is already the right vehicle: re-verify each verified
tenant's DNS on a slower cadence (daily is plenty), and treat a drop the same way you
treat a reputation threshold — warn, then act, with a stated reason.

**A silent failure is not best-effort.** That is your line, from your own commit log.

---

## 4. Put the tests in CI or they will rot

81 tests exist, including isolation cases proven to fail when the fix is reverted. That is
the right way to write them and it is worth protecting.

But nothing runs them automatically. A suite that only runs when someone remembers is a
suite that goes red quietly and then gets ignored. The isolation tests especially: their
whole purpose is catching a regression nobody is looking for.

**Proposal:** GitHub Actions on push and PR — `pnpm test`, typecheck, lint. Nothing
elaborate. And a note in `ROADMAP.md` that is true, since that file has already been wrong
about tests once.

Related: **`ENCRYPTION_KEY` now fails closed in production.** Please make sure the deploy
runbook and `.env.prod` reflect that, and that there is a documented answer for what
happens if it is ever lost — right now that would be unrecoverable for every sub-tenant's
DKIM key, and there is no re-wrap path.

---

## 5. DKIM rotation — the claim we had to delete

We pulled the automatic-rotation claim from the blog seed because it was untrue. It is
worth making true: dual-selector overlap — generate the new key, publish both records,
wait for propagation, cut over, retire the old selector.

Lower urgency than 1–4, but it is the one deleted claim that was a genuinely good idea
rather than an overreach.

---

## 6. RFC-header threading — correctness, not marketing

`In-Reply-To` and `References` appear nowhere. Threading works via a plus-addressed reply
token plus subject normalisation, which is clever and works for the common path — but it
breaks on replies to forwarded copies and on clients that ignore `Reply-To`, and our own
replies do not thread correctly in the *recipient's* mail client. That last one is visible
to our customer's customer, which makes it a product-quality issue rather than a feature.

Persist outbound `Message-ID`, emit `In-Reply-To`/`References` on replies, fall back to
them on inbound.

---

## 7. Per-tenant dedicated IPs — the last mile, and I am not sure it is next

This is what would make *"one client's mistake never touches another's delivery"* literally
true. AWS SES resource tenants map closely onto the existing schema.

But I want to argue **against** doing it now. Dedicated IPs need volume to warm — a low-volume
client on a dedicated IP has *worse* deliverability than one in a well-managed shared pool.
Until there are clients sending enough to warm an IP, this buys a marketing line and a
support burden.

Better sequencing: ship 1–4, get clients onboarded and sending, and revisit when volume
justifies it. **Tell me if you disagree** — you can see the sending profile and I cannot.

---

## Suggested order

**4 → 3 → 2 → 1 → 5 → 6 → 7**

CI first because it protects everything after it. Then drift detection, because it is small
and closes the scariest silent failure. Then the diagnostic, because it is mostly assembly
of existing data and immediately useful in a demo. Then hosted subdomains, which is the
biggest and the one that changes the funnel.

If you think that order is wrong, say so in `docs/COLLAB.md` — you have information I do not.
