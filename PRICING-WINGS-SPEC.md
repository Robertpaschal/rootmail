# Spec — Independent per-wing pricing (Transactional × Marketing × Platform)

Status: **v2 — approach approved by owner (2026-07-07); numbers + v2 delegated to me.** Building.
Source: owner's 2nd first-principles doc + the two Mailchimp references
(Transactional = send-volume *blocks*; Marketing = *contacts* + "find my plan").

**Owner sign-off (2026-07-07):** yes to the whole approach. Owner delegated the v2
detail + strawman numbers to me, added **AI credits** (I'd omitted them) and a small
**rootmail branding footer** on free/low tiers (removed by upgrading), and stressed
that **the UI must do the conviction** — a transactional payer should feel genuinely
compelled to also pay for Platform when they need it (real marketing-grade design,
cross-selling the wings). Crucially: **no real users in the DB yet, only test
accounts** → we can reseed freely; no grandfathering needed.

---

## 1. The idea in one line

Stop pricing rootmail as one ladder that spans both products. Price each wing on
**its own axis**, independently, so an org can be **Free on Transactional and paid
on Marketing — or the reverse** — and pay only for the side they actually use.

- **Transactional** is driven by **email send volume** → priced in **blocks of sends**.
- **Marketing** is driven by **audience size** → priced by **contacts**.
- **Platform** (team/security/compliance) is org-level and cross-wing → a small
  separate layer.

---

## 2. Today (what we're changing)

- One ladder: `free / pro / scale / enterprise` (`PLAN_IDS`), one
  `stripeSubscriptionId` per org, one `monthly_quota` + overage meter.
- 11 feature flags gate everything, lowest-tier-that-has-it
  (`requiredPlanFor`): `audit, suppression, subtenants, threads, sequences,
  campaigns, rbac, proof, dedicated_ip, sso, residency`.
- Seats, workspaces, AI credits, includedSubTenants all hang off the one plan.
- `contacts` exist but are **never counted or limited**. Add-ons: extra_seat,
  dedicated_ip, subtenant_pack, workspace_pack, ai_credit_pack.
- Admin-editable `plans`/`addons` tables (constant fallback); per-org `customPlans`.

Everything above keeps working during the transition (see §8 Migration).

---

## 3. The three dimensions

### 3a. Transactional — priced by SEND VOLUME (blocks)
- **Free:** 3,000 sends/mo, hard cap. Includes the send API, templates & blocks,
  the test sandbox, suppression, and the audit trail. This is the developer's
  "just an API key" entry point.
- **Paid:** **blocks**, 1 block = **25,000 sends/mo**, with volume discounts and a
  live sends estimator (the Mailchimp-transactional pattern). Under the hood a
  Stripe **quantity** subscription (quantity = blocks) with our tiered per-block
  price. Overage past purchased blocks bills per-1,000 (today's meter) or nudges +1 block.
- **Transactional feature classes** (unlock by block tier or as add-ons): client
  domains (sub-tenants), dedicated IP, higher webhook/deliverability limits.

Strawman block ladder (owner sets real numbers in admin):

| Blocks | Sends/mo | $/block/mo |
|--------|----------|-----------|
| 1–4    | ≤100k    | $8 |
| 5–20   | ≤500k    | $7 |
| 21–80  | ≤2M      | $6 |
| 80+    | custom   | contact us |

Add-on: Dedicated IP ~$30/mo. Client domains: included from N blocks, or a small
per-domain/mo above that.

### 3b. Marketing — priced by CONTACTS (audience size)
- **Free:** up to **500 contacts**, one audience, basic one-off campaign sends.
- **Paid tiers by contact bracket** (Mailchimp-style selector), each unlocking more
  of the marketing toolset:

| Tier    | Contacts | Unlocks (cumulative)                                   | Strawman $/mo |
|---------|----------|--------------------------------------------------------|---------------|
| Free    | ≤500     | 1 audience, basic campaigns                            | $0 |
| Starter | ≤2,500   | campaigns + analytics funnel, multiple audiences       | $15 |
| Growth  | ≤10,000  | + sequences/automation, replies inbox (threads)        | $45 |
| Pro     | ≤50,000  | + advanced automation, send-time, more audiences       | $120 |
| 50k+    | custom   | contact us                                             | — |

**Contact counting rule (owner's):** a contact in more than one audience counts
**once per audience it appears in** — billable audience size = Σ audience memberships,
not distinct people. (Confirm in §11.)

### 3c. Platform — org-level, cross-wing
Seats, workspaces, roles (RBAC), SSO + SCIM, proof/compliance exports, data
residency. Options in §11; recommended = a light 3-tier platform layer:

| Tier       | Seats | Workspaces | Adds                               | Strawman $/mo |
|------------|-------|-----------|------------------------------------|---------------|
| Solo       | 2     | 1         | base roles                          | $0 |
| Team       | 10    | 5         | custom roles (RBAC)                 | $25 |
| Enterprise | ∞     | ∞         | SSO+SCIM, proof, residency, custom  | contact us |

### 3d. Org-level: AI credits & branding (cut across wings)

Two things aren't sends or contacts — they're org-level — so they're granted at the
org level and *sum* across whatever the org is paying for (paying for more wings =
more of both, which is exactly the cross-sell conviction the owner wants).

**AI assistant credits.** The assistant builds, operates, and diagnoses across both
wings, so credits are org-level and accrue from every active tier + the existing
`ai_credit_pack` add-on (−1 = unlimited wins):

| Grants | Strawman AI credits/mo |
|--------|------------------------|
| Free baseline (any org) | 15 |
| Transactional — any paid block tier | +25 |
| Marketing — Starter / Growth / Pro | +25 / +75 / +150 |
| Platform — Team / Enterprise | +100 / unlimited |
| `ai_credit_pack` add-on | +100 per pack |

Effective monthly credits = Σ of the above (or unlimited). A free-everything org gets
15; a transactional-only payer gets 40; someone paying all three wings gets a lot —
by design.

**rootmail branding footer.** Emails sent from a **Free wing** carry a small,
non-obstructive "Sent with rootmail" line, **removed the moment that wing is paid**.
It's per-wing so it lands where the value is: a free transactional sender sees it on
their app emails (nudging the Transactional upgrade), a free marketer sees it on
campaigns. Implemented as an entitlement (`branding_footer`, present on Free, absent
on any paid tier), appended in the send pipeline right after the compliance footer —
the same place `appendComplianceFooter` runs. Sandbox/test sends are exempt (they
never leave). In today's single-plan world it degrades gracefully: Free plan → branded,
any paid plan → unbranded.

---

## 4. Feature → dimension mapping (re-homing the 11 flags)

| Dimension     | Features |
|---------------|----------|
| Transactional | `audit`, `suppression`, `subtenants` (client domains), `dedicated_ip` |
| Marketing     | `campaigns`, `sequences`, `threads` (replies inbox) |
| Platform      | `rbac`, `sso`, `proof`, `residency` |

(This is exactly the `WING_OF` grouping already shipped on the plan cards, so the
dashboard's mental model already matches.)

---

## 5. Data model changes

1. **New tier ladders.** Extend the pricing tables so a tier belongs to a
   `dimension` ∈ {transactional, marketing, platform}. Cleanest: keep `plans` for
   transactional/legacy and add `marketing_tiers` + `platform_tiers` (or one
   `pricing_tiers` table with a `dimension` column + a `metric`: sends|contacts|seats).
2. **Per-org subscriptions become per-wing.** organizations gains
   `transactionalTier`, `marketingTier`, `platformTier` + `stripeTxSubscriptionId`,
   `stripeMkSubscriptionId`, `stripePlatformSubscriptionId`. Keep the legacy
   `plan` + `stripeSubscriptionId` columns for grandfathered orgs (§8).
3. **Contact metering.** A per-org (or per-workspace) billable-contact count,
   recomputed on contact/audience change, checked against the marketing tier.
   Likely a materialized counter + a nightly reconcile.
4. **Entitlements resolver** (`planForOrg`) splits into `txFor(org)`, `mkFor(org)`,
   `platformFor(org)`; `requireFeature` looks up the feature's dimension then that
   wing's tier. Legacy orgs resolve all three from their single `plan`.

---

## 6. Stripe scoping

- Up to **three subscriptions per org**, one per wing that's paid (Free wings create
  no subscription). Transactional = quantity(blocks)×per-block price; Marketing =
  the contact-bracket price; Platform = the platform-tier price (+ seats add-on).
- Admin pricing catalog (already exists) gains the per-wing ladders and syncs each
  to its own Stripe products/prices — same sync machinery as today's plans/addons.
- Yearly billing + sales/promo continue to work per subscription (each wing can be
  monthly or yearly independently; overage stays monthly, as today).

---

## 6b. Overages & add-ons (per wing) — explicit

Both exist today on the single plan; in the new model each attaches to the **wing it
belongs to**, so a bill reads cleanly and each wing is independently controllable.

**Overages — what happens past the included amount, per wing:**

| Wing | Metric | Over the limit → |
|------|--------|------------------|
| Transactional | sends/mo | **metered overage**, billed per 1,000 past the purchased blocks (today's `usageRecords` meter + Stripe metered price). "Sending never just stops." Or auto-add a block if the owner prefers hard blocks — a per-org toggle. |
| Marketing | contacts | **no per-unit overage** — you move to the next contact bracket. Adding contacts past the bracket prompts an upgrade (soft-block on *growing* the audience; existing contacts/sends keep working). |
| Platform | seats / workspaces | **no metered overage** — buy an `extra_seat` / `workspace_pack` add-on (below). Over the cap simply blocks adding the next seat/workspace until purchased. |

Overage always bills **monthly**, even for yearly wings (Stripe can't mix intervals
in one sub) — the existing dedicated-monthly-overage-sub mechanism carries it.

**Add-ons — re-homed to their wing** (today's five, plus branding-removal is *not* an
add-on — it's automatic on any paid wing):

| Add-on (today's id) | Wing it attaches to | What it does |
|---------------------|---------------------|--------------|
| `dedicated_ip` | Transactional | A sending IP only you use — your reputation. |
| `subtenant_pack` | Transactional | Extra client sending domains past the tier's included count. |
| `extra_seat` | Platform | One more team seat. |
| `workspace_pack` | Platform | +N live workspaces. |
| `ai_credit_pack` | Org-level (bills on the Platform sub, or standalone if no paid wing) | +100 AI assistant credits/mo (§3d). |

Each add-on's Stripe price attaches to that wing's subscription; if the wing is Free
(no subscription yet), buying a wing add-on either creates the wing's subscription at
its Free/base or bills the add-on standalone — decided at build time, but the default
is "an add-on that needs a paid wing prompts the smallest paid tier that includes it"
(keeps the cross-sell honest and the Stripe model clean). The tier-specific configure
step (§7) is where these are toggled with a plain-English explanation of each.

---

## 7. Surfaces to change

> **Design principle (owner):** the UI does the conviction. Each wing's pricing must
> feel like a real, persuasive product page — value first, price in context, honest
> discounts — so that someone who came for Transactional *understands and wants* what
> Platform (or Marketing) would add. Cross-sell the other wings tastefully wherever a
> user is clearly hitting their edge; never a bare number, always the case for it.


- **Dashboard billing:** `/billing` becomes per-wing. Each wing gets its own compare
  table — **best plan first, Free last** — plus a **"find my plan" quiz** (a few
  questions → recommended tier) and a "create a custom plan / contact us". Choosing a
  tier opens a **tier-specific configure step** (explain + toggle add-ons) → Stripe
  checkout (just checkout + promo). Deep-linkable: any limit/feature-lock jumps to its
  wing's configure step.
- **FeatureLocked:** already markets the tier; point it at the feature's *wing* tier.
- **Onboarding pitch:** recommend a tier *per wing* from the onboarding answers
  (business type + how they send) instead of one blended plan.
- **Admin:** the pricing control center manages three ladders instead of one.
- **Marketing site:** two pricing pages (Transactional / Marketing) mirroring the
  dashboard — folds into #59.

---

## 8. Migration — trivial (no real users)

The owner confirmed **there are no real users in the DB, only test accounts**, so
there is no grandfathering problem: we reseed. `db:seed` and the prod catalog seed
become three-wing; test accounts get sensible default tiers (Free everywhere). The
single-plan resolver keeps a graceful fallback during the build (an org with only a
legacy `plan` resolves all three wings from it) purely so each phase deploys without a
flag day — but no customer migration flow is needed. Legacy plan ids can be dropped
from the catalog once Phase D lands.

---

## 9. Enforcement changes

- **Transactional:** `monthlyQuota` per send becomes "purchased blocks × 25k"; the
  existing `usageRecords.emailsSent` meter already tracks it. Overage unchanged.
- **Marketing:** new check — adding contacts / audience members past the tier's
  contact bracket prompts an upgrade (soft-block: can't grow the audience until
  upgraded, existing sends unaffected).
- **Platform:** seats/workspaces/roles/SSO/proof/residency resolve from the platform
  tier (today they're on the single plan).

---

## 10. Phasing

- **A. Model + admin catalog** — schema for three ladders, admin edits them, legacy
  path intact. *No customer-visible change yet.*
- **B. Entitlements + metering** — split resolver; add contact metering; re-home the
  11 flags to wings (behind the legacy fallback).
- **C. Dashboard surfaces** — per-wing compare + quiz + configure→checkout;
  feature-locks/onboarding point at the right wing.
- **D. Stripe wiring + migration** — three subscriptions, opt-in switch flow,
  grandfathering.
- **E. Marketing pricing pages** — with #59.

Each phase ships + deploys independently; nothing charges differently until D.

---

## 11. Decisions — RESOLVED (2026-07-07)

1. **Transactional = blocks** of 25k sends with volume discounts + estimator. ✅
2. **Contacts billed by audience membership** (a contact in 3 audiences = 3), with
   clear UI so it's never a surprise. ✅
3. **Platform = its own small 3-tier layer** (Solo / Team / Enterprise). ✅
4. **Strawman numbers** = mine to set (in this spec + admin-editable). ✅ Set above;
   refine in the admin pricing catalog.
5. **Migration = trivial** — no real users, reseed (see §8). ✅
6. **Yearly billing** on all three wings, like today. ✅
7. **AI credits** = org-level, summed per active tier + pack (§3d). ✅
8. **rootmail branding footer** on Free wings, removed on upgrade (§3d). ✅
9. **Overages & add-ons** covered per wing (§6b): transactional = metered send
   overage; marketing = bracket-up (no per-unit overage); platform = seat/workspace
   packs; today's five add-ons re-homed to their wing; branding-removal is automatic
   on any paid wing, not an add-on. ✅

Build order: branding footer first (self-contained, ships today), then Phase A.
