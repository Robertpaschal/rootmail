import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ADD_ON_IDS,
  type AddOnId,
  BILLING_INTERVALS,
  BILLING_MODE,
  ADD_ONS,
  BLOCK_BRACKETS,
  BLOCK_SIZE,
  blocksMonthlyPrice,
  CONTACT_STEPS,
  CONTACT_UNIT,
  FREE_MK_CONTACTS,
  MAX_SELF_SERVE_CONTACTS,
  Errors,
  FREE_TX_SENDS,
  MAX_SELF_SERVE_BLOCKS,
  newId,
  type PlanDef,
  saleActive,
  salePrice,
  type TierDef,
  WINGS,
  yearlyPrice,
  YEARLY_MONTHS_FREE,
} from "@rootmail/core";
import { db, type Organization, organizations, type OrgAddon, orgAddons } from "@rootmail/db";
import { currentPeriod, getAiUsage, type QuotaState, quotaState } from "../lib/billing";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { aiCreditsForOrg, getAddon, getAiCredits, getSale, getTrialDays, listAddons, listPlans, orgAddonQuantities } from "../lib/plans";
import { type SeatState, seatState } from "../lib/seats";
import { getTier, marketingPriceForOrg, tiersForWing } from "../lib/wings";
import {
  assignWingTier,
  cancelWingSubscription,
  createAddonsEmbeddedCheckout,
  createWingCheckout,
  createWingEmbeddedCheckout,
  listInvoices,
  reportOverage,
  syncAddonItems,
  syncDedicatedIpProvisioning,
} from "../lib/stripe";
import { parse } from "../lib/validate";

function serializePlan(p: PlanDef) {
  const py = yearlyPrice(p.id);
  const sale = getSale(p.id);
  const onSale =
    p.price != null && p.price > 0 && saleActive(sale ? { percentOff: sale.percentOff, endsAt: sale.endsAt } : null);
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    price_yearly: py,
    monthly_quota: p.monthlyQuota,
    allow_overage: p.allowOverage,
    overage_per_1000: p.overagePer1000,
    included_sub_tenants: p.includedSubTenants,
    seats: p.seats,
    workspace_limit: p.workspaceLimit,
    trial_days: getTrialDays(p.id),
    ai_credits: getAiCredits(p.id),
    features: p.features,
    // Public sale (null when not on sale). Prices are the discounted amounts.
    sale_percent_off: onSale ? sale!.percentOff : null,
    sale_ends_at: onSale ? sale!.endsAt : null,
    sale_price: onSale ? salePrice(p.price as number, sale!.percentOff) : null,
    sale_price_yearly: onSale && py != null ? salePrice(py, sale!.percentOff) : null,
  };
}

// Per-wing pricing catalog (PRICING-WINGS-SPEC.md). Served alongside the legacy
// `plans` so the dashboard can render the three ladders; `current_tier_id` is null
// for every org today (legacy single-plan) until Phase C/D assigns a wing tier.
function serializeTier(t: TierDef) {
  return {
    id: t.id,
    wing: t.wing,
    name: t.name,
    rank: t.rank,
    price_monthly: t.priceMonthly,
    price_yearly: t.priceYearly,
    ai_credits: t.aiCredits,
    features: t.features,
    trial_days: t.trialDays,
    included_sends: t.includedSends ?? null,
    block_size: t.blockSize ?? null,
    allow_overage: t.allowOverage ?? false,
    overage_per_1000: t.overagePer1000 ?? 0,
    included_sub_tenants: t.includedSubTenants ?? null,
    included_contacts: t.includedContacts ?? null,
    // Marketing: the contact-size multipliers (price/sends/daily = contacts × these).
    per_thousand_cents: t.perThousandCents ?? null,
    sends_per_contact: t.sendsPerContact ?? null,
    daily_per_contact: t.dailyPerContact ?? null,
    included_audiences: t.includedAudiences ?? null,
    seats: t.seats ?? null,
    workspace_limit: t.workspaceLimit ?? null,
  };
}

function wingsPayload(org: Organization) {
  return {
    transactional: {
      current_tier_id: org.transactionalTier ?? null,
      // The block model — everything the estimator UI needs to price honestly.
      blocks: org.transactionalBlocks,
      block_size: BLOCK_SIZE,
      free_sends: FREE_TX_SENDS,
      max_blocks: MAX_SELF_SERVE_BLOCKS,
      brackets: BLOCK_BRACKETS.map((b) => ({ up_to_blocks: b.upToBlocks, per_block: b.perBlock })),
      tiers: tiersForWing("transactional").map(serializeTier),
    },
    marketing: {
      current_tier_id: org.marketingTier ?? null,
      // The contact-size model — the selector needs the steps + free ceiling.
      contacts: org.marketingContacts,
      free_contacts: FREE_MK_CONTACTS,
      contact_steps: CONTACT_STEPS,
      max_contacts: MAX_SELF_SERVE_CONTACTS,
      tiers: tiersForWing("marketing").map(serializeTier),
    },
  };
}

/**
 * The collective bill: plan base + metered overage + purchased add-ons (incl.
 * extra seats), all at monthly amounts, plus the yearly option + savings. Amounts
 * come from PLANS/ADD_ONS defaults, so it's always populated even without Stripe.
 */
function billingSummary(org: Organization, usage: QuotaState, seats: SeatState, addons: OrgAddon[]) {
  const plan = usage.plan;
  // The bill reads per wing — transactional by blocks, marketing by contact size ×
  // tier. Platform is the free base (no line); its extras appear as add-ons below.
  const blocks = org.transactionalBlocks ?? 0;
  const mkTier = getTier(org.marketingTier ?? "mk_free");
  const contacts = org.marketingContacts ?? 0;
  const mkAmount = marketingPriceForOrg(org);
  const lines: Array<{ label: string; kind: string; amount: number }> = [
    {
      label:
        blocks > 0
          ? `Transactional · ${blocks} block${blocks === 1 ? "" : "s"} (${(blocks * BLOCK_SIZE).toLocaleString()} sends/mo)`
          : "Transactional · Free allowance",
      kind: "base",
      amount: blocks > 0 ? blocksMonthlyPrice(blocks) : 0,
    },
    {
      label:
        mkAmount > 0
          ? `Marketing · ${mkTier?.name} (${contacts.toLocaleString()} contacts)`
          : "Marketing · Free",
      kind: "base",
      amount: mkAmount,
    },
  ];
  if (usage.overage_cost > 0) {
    lines.push({
      label: `Transactional overage · ${usage.overage.toLocaleString()} emails`,
      kind: "overage",
      amount: usage.overage_cost,
    });
  }

  const addonLines = addons
    .filter((a) => a.quantity > 0)
    .map((a) => {
      const def = getAddon(a.addonId as AddOnId);
      const unit = def?.unitAmount ?? 0;
      const onSale = !!def && saleActive({ percentOff: def.salePercentOff ?? 0, endsAt: def.saleEndsAt });
      const effUnit = onSale ? salePrice(unit, def.salePercentOff as number) : unit;
      return {
        id: a.addonId,
        name: def?.name ?? a.addonId,
        quantity: a.quantity,
        unit_amount: effUnit,
        original_unit_amount: onSale ? unit : null,
        sale_percent_off: onSale ? (def.salePercentOff as number) : null,
        amount: a.quantity * effUnit,
      };
    });
  for (const a of addonLines) {
    lines.push({ label: `${a.name} ×${a.quantity}`, kind: "addon", amount: a.amount });
  }

  const monthlyTotal = lines.reduce((s, l) => s + l.amount, 0);
  // Yearly is chosen per wing at checkout now — no single blended yearly option.
  const yp: number | null = null;
  return {
    currency: "usd",
    interval: org.billingInterval,
    custom: plan.price === null,
    lines,
    seats: {
      included: seats.included,
      purchased: seats.purchased,
      used: seats.used,
      capacity: seats.capacity === Infinity ? -1 : seats.capacity,
      unit_price: getAddon("extra_seat").unitAmount,
    },
    add_ons: addonLines,
    monthly_total: monthlyTotal,
    yearly_option:
      yp === null
        ? null
        : (() => {
            // Add-ons bill at the same interval as the plan, with the same months-free
            // discount — so the yearly option reflects plan + add-ons, not just the plan.
            const addonsMonthly = addonLines.reduce((s, a) => s + a.amount, 0);
            const addonsYearly = addonsMonthly * (12 - YEARLY_MONTHS_FREE);
            const total = yp + addonsYearly;
            return {
              plan_amount: yp,
              addons_amount: addonsYearly,
              total,
              equivalent_monthly: Math.round((total / 12) * 100) / 100,
              savings_vs_monthly: ((plan.price ?? 0) + addonsMonthly) * YEARLY_MONTHS_FREE,
            };
          })(),
    total: monthlyTotal,
  };
}

async function billingPayload(org: Organization, usage: QuotaState) {
  const [seats, addons, aiCredits, aiUsed] = await Promise.all([
    seatState(org),
    db.select().from(orgAddons).where(eq(orgAddons.organizationId, org.id)),
    aiCreditsForOrg(org),
    getAiUsage(org.id),
  ]);
  return {
    object: "billing",
    organization_id: org.id,
    billing_mode: BILLING_MODE,
    billing_interval: org.billingInterval,
    plan_status: org.planStatus,
    plan: serializePlan(usage.plan),
    usage: {
      period: currentPeriod(),
      used: usage.used,
      quota: usage.quota,
      remaining: usage.remaining,
      overage: usage.overage,
      overage_cost: usage.overage_cost,
      over_limit: usage.over_limit,
      // Org-level AI credits (base + packs, carried across both wings).
      ai_credits: aiCredits,
      ai_used: aiUsed,
      // Marketing volume is metered against the contact-scaled monthly + daily caps.
      marketing_sent: usage.marketing_sent,
      marketing_allowance: usage.marketing_allowance,
      marketing_sent_today: usage.marketing_sent_today,
      marketing_daily_limit: usage.marketing_daily_limit,
      contacts_used: usage.contacts_used,
      contacts_limit: usage.contacts_limit,
      audiences_used: usage.audiences_used,
      audiences_limit: usage.audiences_limit,
    },
    summary: billingSummary(org, usage, seats, addons),
    plans: listPlans().map(serializePlan),
    // The three independent per-wing ladders (read-only preview in the dashboard).
    wings: wingsPayload(org),
    // Live add-on catalog (with any active sale) so the dashboard shows real prices.
    addons_catalog: listAddons()
      .filter((a) => a.active)
      .map((a) => {
        const onSale = saleActive({ percentOff: a.salePercentOff ?? 0, endsAt: a.saleEndsAt });
        const def = ADD_ONS[a.id];
        return {
          id: a.id,
          name: a.name,
          unit: a.unit,
          // Plain-English "what is one unit" + grouping + toggle-ness for the UI.
          unit_note: def.unitNote,
          grants_feature: def.grantsFeature ?? null,
          max: def.max ?? null,
          group: def.wing, // "transactional" folds into blocks; "platform" = everywhere
          description: a.description,
          unit_amount: a.unitAmount,
          unit_amount_yearly: a.unitAmount * (12 - YEARLY_MONTHS_FREE),
          sale_percent_off: onSale ? a.salePercentOff : null,
          sale_price: onSale ? salePrice(a.unitAmount, a.salePercentOff as number) : null,
          sale_price_yearly: onSale
            ? salePrice(a.unitAmount, a.salePercentOff as number) * (12 - YEARLY_MONTHS_FREE)
            : null,
          sale_ends_at: onSale ? a.saleEndsAt : null,
        };
      }),
  };
}

async function orgForReq(req: FastifyRequest): Promise<Organization> {
  return loadOrg(req);
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Public pricing catalog (no auth — see PUBLIC_PREFIXES) so the marketing site
  // can show live prices + any active sale. Org-agnostic: the same plan data the
  // dashboard sees, with no usage/seat specifics.
  app.get("/v1/pricing", async () => {
    return { object: "list", data: listPlans().map(serializePlan) };
  });

  app.get("/v1/billing", async (req) => {
    const org = await orgForReq(req);
    // Lazily push current-period overage to Stripe's metered item (best-effort —
    // never block or fail the bill view on a Stripe round-trip).
    if (BILLING_MODE === "stripe") {
      void reportOverage(org).catch((err) => req.log.warn({ err }, "overage report failed"));
    }
    return billingPayload(org, await quotaState(org));
  });

  // Set an add-on quantity (extra seats, dedicated IP, sub-tenant packs, AI
  // credit packs). org_addons is the entitlement source of truth the app reads;
  // in Stripe mode the change is mirrored to the subscription as a billed item.
  app.post("/v1/billing/addons", async (req) => {
    const { addon_id, quantity } = parse(
      z.object({ addon_id: z.enum(ADD_ON_IDS), quantity: z.coerce.number().int().min(0).max(1000) }),
      req.body,
    );
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");
    // Per-wing billing: each add-on attaches to ITS wing's subscription — the sync
    // below enforces that (and the entitlement rolls back if the wing isn't paid).

    // Remember the prior quantity so we can roll back if the Stripe sync fails —
    // we must never grant an un-billed entitlement.
    const [priorRow] = await db
      .select({ quantity: orgAddons.quantity })
      .from(orgAddons)
      .where(and(eq(orgAddons.organizationId, org.id), eq(orgAddons.addonId, addon_id)))
      .limit(1);
    const prior = priorRow?.quantity ?? 0;

    await db
      .insert(orgAddons)
      .values({ id: newId("orgAddon"), organizationId: org.id, addonId: addon_id, quantity })
      .onConflictDoUpdate({
        target: [orgAddons.organizationId, orgAddons.addonId],
        set: { quantity, updatedAt: new Date() },
      });

    // Flag a dedicated IP for staff provisioning the moment it's purchased.
    if (addon_id === "dedicated_ip") await syncDedicatedIpProvisioning(org.id, quantity);

    if (BILLING_MODE === "stripe") {
      try {
        await syncAddonItems(org);
      } catch (err) {
        // Roll the entitlement back to its prior value, then surface the failure.
        await db
          .insert(orgAddons)
          .values({ id: newId("orgAddon"), organizationId: org.id, addonId: addon_id, quantity: prior })
          .onConflictDoUpdate({
            target: [orgAddons.organizationId, orgAddons.addonId],
            set: { quantity: prior, updatedAt: new Date() },
          });
        req.log.error({ err }, "addon stripe sync failed");
        // A wing-gating failure carries an actionable message ("start a paid X
        // plan first") — surface it; anything else stays generic.
        const msg = err instanceof Error && err.message.includes("wing")
          ? err.message
          : "Couldn't update your subscription — please try again.";
        throw Errors.badRequest(msg);
      }
    }
    return billingPayload(org, await quotaState(org));
  });

  // Past invoices for the financial dashboard — downloadable (hosted URL + PDF).
  app.get("/v1/billing/invoices", async (req) => {
    const org = await loadOrg(req);
    await requirePermission(req, "billing.manage");
    return { object: "list", data: await listInvoices(org) };
  });

  // In-app (embedded) checkout — a client_secret to mount Stripe Checkout inline,
  // no redirect. Covers a wing tier OR a set of add-ons. Buying add-ons ALWAYS
  // opens checkout (already-owned quantities are credited so only the delta is
  // charged); reductions apply directly. Falls back to `assigned` (free/local)
  // so the flow always resolves.
  app.post("/v1/billing/checkout/embedded", async (req) => {
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");
    const body = parse(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("wing"),
          wing: z.enum(WINGS),
          tier_id: z.string(),
          interval: z.enum(BILLING_INTERVALS).optional(),
          blocks: z.coerce.number().int().min(1).max(MAX_SELF_SERVE_BLOCKS).optional(),
          contacts: z.coerce.number().int().min(1).max(MAX_SELF_SERVE_CONTACTS).optional(),
          // This wing's own add-ons, folded into the SAME checkout (one subscription).
          addons: z.record(z.coerce.number().int().min(0).max(1000)).optional(),
        }),
        z.object({
          kind: z.literal("addons"),
          addons: z.record(z.coerce.number().int().min(0).max(1000)),
        }),
      ]),
      req.body,
    );

    if (body.kind === "wing") {
      const tier = getTier(body.tier_id);
      if (!tier || tier.wing !== body.wing) throw Errors.badRequest("Unknown tier for that wing.");
      const interval = body.interval ?? "month";
      const isMktPaid = body.wing === "marketing" && (tier.perThousandCents ?? 0) > 0;
      const isPaid = body.tier_id === "tx_blocks" || isMktPaid || (tier.priceMonthly ?? 0) > 0;
      const opts = {
        blocks: body.tier_id === "tx_blocks" ? (body.blocks ?? 1) : 0,
        contacts: isMktPaid ? (body.contacts ?? CONTACT_UNIT) : 0,
        addons: body.addons as Record<AddOnId, number> | undefined,
      };
      if (isPaid) {
        const res = await createWingEmbeddedCheckout(org, tier.id, interval, opts);
        if (res.mode === "embedded") {
          return { object: "embedded_checkout", available: true, client_secret: res.client_secret, publishable_key: res.publishable_key };
        }
        if (BILLING_MODE === "stripe") {
          throw Errors.badRequest("Couldn't start checkout right now — please try again in a moment.");
        }
      }
      // Free tier or local mode → assign directly.
      await cancelWingSubscription(org, body.wing);
      await assignWingTier(org.id, body.wing, tier.id, opts);
      return { object: "embedded_checkout", available: false, mode: "assigned", wing: body.wing, tier_id: tier.id };
    }

    // Add-ons. `body.addons` is the DESIRED TOTAL per add-on (what you'll have).
    const desired = body.addons;
    const current = await orgAddonQuantities(org.id);
    const isIncrease = ADD_ON_IDS.some((id) => Math.floor(desired[id] ?? 0) > (current[id] ?? 0));

    const applyTotals = async () => {
      for (const id of ADD_ON_IDS) {
        const qty = Math.max(0, Math.floor(desired[id] ?? 0));
        await db
          .insert(orgAddons)
          .values({ id: newId("orgAddon"), organizationId: org.id, addonId: id, quantity: qty })
          .onConflictDoUpdate({ target: [orgAddons.organizationId, orgAddons.addonId], set: { quantity: qty, updatedAt: new Date() } });
      }
      try {
        await syncAddonItems(org);
      } catch (err) {
        req.log.error({ err }, "addon sync failed");
      }
    };

    // Buying MORE always goes through a real Stripe checkout: the order is shown,
    // the card is charged immediately, and everything already owned is CREDITED on
    // the first invoice — so the payment is exactly the delta, never a re-bill and
    // never a silent "you're all set". (The completion webhook cancels the prior
    // add-ons subscription and reconciles entitlements to the new one.) Fails
    // CLOSED: a paid add-on is never granted without its payment moment.
    if (isIncrease && BILLING_MODE === "stripe") {
      const res = await createAddonsEmbeddedCheckout(org, desired as Record<AddOnId, number>, current);
      if (res.mode === "embedded") {
        return { object: "embedded_checkout", available: true, client_secret: res.client_secret, publishable_key: res.publishable_key };
      }
      throw Errors.badRequest("Couldn't start checkout right now — please try again in a moment.");
    }

    // Reductions (or local mode) apply directly — dropping add-ons needs no card;
    // the sync prorates the existing subscription down (credit, not a charge).
    await applyTotals();
    return {
      object: "embedded_checkout",
      available: false,
      mode: BILLING_MODE === "stripe" ? "updated" : "assigned",
    };
  });

  // Choose a per-wing tier — THE plan-change endpoint (PRICING-WINGS-SPEC.md).
  // Custom → contact sales; a paid tier → hosted Stripe checkout (the webhook
  // applies it; blocks ride as the subscription quantity); Free → assigned
  // directly. Fails CLOSED for paid tiers in Stripe mode — never silently grants
  // a paid wing un-billed.
  app.post("/v1/billing/wing/checkout", async (req) => {
    const body = parse(
      z.object({
        wing: z.enum(WINGS),
        tier_id: z.string(),
        interval: z.enum(BILLING_INTERVALS).optional(),
        // Transactional blocks (quantity × 25k sends/mo); ignored on other tiers.
        blocks: z.coerce.number().int().min(1).max(MAX_SELF_SERVE_BLOCKS).optional(),
        // Marketing CONTACT SIZE (the base the tier multiplies); ignored elsewhere.
        contacts: z.coerce.number().int().min(1).max(MAX_SELF_SERVE_CONTACTS).optional(),
      }),
      req.body,
    );
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");

    const tier = getTier(body.tier_id);
    if (!tier || tier.wing !== body.wing) {
      throw Errors.badRequest("Unknown tier for that wing.");
    }
    const interval = body.interval ?? "month";
    const blocks = body.tier_id === "tx_blocks" ? (body.blocks ?? 1) : 0;
    const isMktPaid = body.wing === "marketing" && (tier.perThousandCents ?? 0) > 0;
    const contacts = isMktPaid ? (body.contacts ?? CONTACT_UNIT) : 0;
    const opts = { blocks, contacts };
    // Paid = blocks tier, a per-contact marketing tier, or a flat-priced tier.
    const isPaid = body.tier_id === "tx_blocks" || isMktPaid || (tier.priceMonthly ?? 0) > 0;

    if (tier.priceMonthly === null && !isMktPaid && body.tier_id !== "tx_blocks") {
      return { object: "wing_checkout", mode: "contact_sales", wing: body.wing };
    }
    if (isPaid) {
      const res = await createWingCheckout(org, tier.id, interval, opts);
      if (res.mode === "stripe") {
        return { object: "wing_checkout", mode: "stripe", url: res.url };
      }
      // Fail CLOSED in Stripe mode (misconfigured price / outage) — never grant a
      // paid wing without billing it. Local/self-host mode assigns directly below.
      if (BILLING_MODE === "stripe") {
        throw Errors.badRequest(
          "Couldn't start checkout right now — please try again in a moment or contact support.",
        );
      }
    }
    // Free tier, or local-mode paid: assign directly + cancel any existing paid sub.
    await cancelWingSubscription(org, body.wing);
    await assignWingTier(org.id, body.wing, tier.id, opts);
    return {
      object: "wing_checkout",
      mode: "assigned",
      wing: body.wing,
      tier_id: tier.id,
      ...(blocks ? { blocks } : {}),
      ...(contacts ? { contacts } : {}),
    };
  });
}
