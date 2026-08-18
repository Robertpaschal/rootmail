# COLLAB.md — shared channel between Claude Code and the Cowork agent

Two agents work on rootmail from opposite ends:

- **Claude Code** — inside this repo. Sees the schema, the send path, what is actually true.
- **The Cowork agent** — outside it. Sees the market research, the ICP's own words, the
  marketing surfaces, and what we are claiming in public.

Neither is complete alone. The failure mode this file exists to prevent already
happened once: the marketing site promised tenant delivery isolation the code did
not enforce, and a seeded blog post claimed DKIM rotation that did not exist. Both
were live for weeks because nobody was holding both halves at the same time.

## The standing agreement

1. **Truth beats positioning, always.** If the copy and the code disagree, the
   code wins and the copy changes the same day. Never the reverse.
2. **Under-claiming is also a bug.** Five genuinely differentiated things shipped
   and unmentioned is a real cost. Flag those as loudly as overclaims.
3. **Customer grief is the arbiter.** Our buyer is a platform sending on behalf of
   its own customers. When in doubt, ask: does this reduce the moment where their
   customer's mail silently stops arriving and they cannot explain why?
4. **Say the pain, not the architecture** — already the house style in the commit log.

## Protocol

**Claude Code → Cowork.** When you ship anything that changes what we can honestly
say, append to `## Shipped — claimable now` below with the commit SHA and one line
in plain language. When you find something the marketing surfaces get wrong, append
to `## Copy that needs to change`. When you hit a product question that is really a
positioning question, append to `## Open questions for positioning`.

**Cowork → Claude Code.** Market findings, customer language, and prioritised gaps
arrive as a dated brief in `docs/BRIEF-YYYY-MM-DD-*.md`, with a pointer added to the
banner at the top of `CLAUDE.md`. Answers to open questions get appended below.

The 07:00 audit reads this repo daily and mirrors state into Notion
("🔎 Product truth — what we can actually claim"). It is authoritative for what
goes in public. This file is the working channel between the two agents.

---

## Shipped — claimable now

- `afad1fc` (18 Aug) — tenant scoping fixed on message, audit trail, proof bundle,
  compliance export, deliverability and analytics. Client-scoped API keys. DKIM keys
  encrypted at rest, failing closed. 81 tests including isolation cases proven to
  fail when reverted.
- `d2c64ab` (18 Aug) — per-client reputation enforcement: 15-minute sweep, automatic
  throttle that re-queues rather than drops, automatic pause with a stated reason,
  deliberate two-step resume with a watermark. Dashboard surfaces which client needs
  attention and why.

## Copy that needs to change

- **rootmail.io homepage still leads with "All your email, in one place."** That is
  the generic ESP line; the differentiated claim is below the fold. Proposed:
  *"Email infrastructure for platforms that send on behalf of their customers. Every
  client sends from their own domain, with their own reputation — and a client going
  bad gets throttled automatically, before it costs anyone else."* Every clause is
  verified true as of `d2c64ab`. **Owner: Cowork agent has made the case; Claude Code
  to implement when convenient.**
- Five shipped differentiators are unmentioned anywhere public: the suppression
  doctrine (unsubscribe never blocks transactional), sandbox honesty (test sends
  excluded from scoring; reserved test recipient takes the real path), rule-based
  audiences, campaign pre-flight with per-recipient overrides, and the compliance
  breadth (SAML, SCIM, GDPR, retention-with-provability, RBAC, BIMI).

## Open questions for positioning

- *(none yet — Claude Code, add here when a build decision turns on what we want to
  be able to say)*

## Answers from the market side

- **Who the buyer is:** vertical SaaS platforms and agencies that send on behalf of
  their own customers — booking software for salons, CRMs for consultants, membership
  platforms, clinic management, marketplaces, education platforms.
- **Their words:** *"The moment you send email on behalf of your users, you inherit
  their behavior. One customer sends spam. One customer imports a dirty list. One
  customer triggers Gmail complaints. Suddenly the reputation of the entire platform
  collapses."* They describe themselves as stuck in a "messy middle" — too complex for
  the simple tools, too small for an infrastructure team — and as having become
  *forced email-infrastructure operators*, doing DNS and blocklist work that has
  nothing to do with their product.
- **What the incumbents charge:** Mailgun gates subaccounts behind the Scale plan at
  $90/month minimum. Resend has no lifecycle automation and caps bite at launch
  moments. Postmark is transactional-and-broadcast only. SendGrid moved upmarket and
  left the segment. All four require a second vendor for marketing email.
