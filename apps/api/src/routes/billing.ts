import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ADD_ON_IDS,
  type AddOnId,
  BILLING_INTERVALS,
  BILLING_MODE,
  Errors,
  newId,
  PLAN_IDS,
  type PlanDef,
  saleActive,
  salePrice,
  yearlyPrice,
} from "@rootmail/core";
import { db, type Organization, organizations, type OrgAddon, orgAddons } from "@rootmail/db";
import { currentPeriod, type QuotaState, quotaState } from "../lib/billing";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { getAddon, getAiCredits, getSale, getTrialDays, listAddons, listPlans } from "../lib/plans";
import { type SeatState, seatState } from "../lib/seats";
import { createCheckout, createEmbeddedCheckout, reportOverage, syncAddonItems } from "../lib/stripe";
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

/**
 * The collective bill: plan base + metered overage + purchased add-ons (incl.
 * extra seats), all at monthly amounts, plus the yearly option + savings. Amounts
 * come from PLANS/ADD_ONS defaults, so it's always populated even without Stripe.
 */
function billingSummary(org: Organization, usage: QuotaState, seats: SeatState, addons: OrgAddon[]) {
  const plan = usage.plan;
  const lines: Array<{ label: string; kind: string; amount: number }> = [
    { label: `${plan.name} plan`, kind: "base", amount: plan.price ?? 0 },
  ];
  if (usage.overage_cost > 0) {
    lines.push({
      label: `Overage · ${usage.overage.toLocaleString()} emails`,
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
  const yp = yearlyPrice(plan.id);
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
        : {
            plan_amount: yp,
            equivalent_monthly: Math.round((yp / 12) * 100) / 100,
            savings_vs_monthly: (plan.price ?? 0) * 12 - yp,
          },
    total: monthlyTotal,
  };
}

async function billingPayload(org: Organization, usage: QuotaState) {
  const seats = await seatState(org);
  const addons = await db.select().from(orgAddons).where(eq(orgAddons.organizationId, org.id));
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
    },
    summary: billingSummary(org, usage, seats, addons),
    plans: listPlans().map(serializePlan),
    // Live add-on catalog (with any active sale) so the dashboard shows real prices.
    addons_catalog: listAddons()
      .filter((a) => a.active)
      .map((a) => {
        const onSale = saleActive({ percentOff: a.salePercentOff ?? 0, endsAt: a.saleEndsAt });
        return {
          id: a.id,
          name: a.name,
          unit: a.unit,
          description: a.description,
          unit_amount: a.unitAmount,
          sale_percent_off: onSale ? a.salePercentOff : null,
          sale_price: onSale ? salePrice(a.unitAmount, a.salePercentOff as number) : null,
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

  // Start a plan change (monthly or yearly). Stripe mode → hosted Checkout;
  // local mode (or unresolved price) → apply directly so self-serve still works.
  app.post("/v1/billing/checkout", async (req) => {
    const { plan, interval } = parse(
      z.object({ plan: z.enum(PLAN_IDS), interval: z.enum(BILLING_INTERVALS).default("month") }),
      req.body,
    );
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");
    if (plan === "enterprise") {
      throw Errors.badRequest("Enterprise is sales-assisted — contact sales to upgrade.");
    }

    const result = await createCheckout(org, plan, interval);
    if (result.mode === "stripe" && result.url) {
      return { object: "checkout", mode: "stripe", url: result.url };
    }
    // Fail CLOSED in Stripe mode: if a checkout session couldn't be created
    // (misconfigured price, Stripe outage), never silently grant a free upgrade.
    // The direct switch below is only for local/self-host mode where there's no
    // Stripe to bill against.
    if (BILLING_MODE === "stripe") {
      throw Errors.badRequest(
        "Couldn't start checkout right now — please try again in a moment or contact support.",
      );
    }
    const [updated] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", billingInterval: interval, updatedAt: new Date() })
      .where(eq(organizations.id, org.id))
      .returning();
    return { object: "checkout", mode: "local", billing: await billingPayload(updated, await quotaState(updated)) };
  });

  // Start an ON-PAGE (embedded) checkout: returns a session client_secret + the
  // publishable key for the dashboard to mount inline. `available: false` when
  // embedded isn't configured (no publishable key, unresolved price) — the caller
  // falls back to the hosted /checkout. Same gating as hosted checkout.
  app.post("/v1/billing/checkout/embedded", async (req) => {
    const { plan, interval, addons } = parse(
      z.object({
        plan: z.enum(PLAN_IDS),
        interval: z.enum(BILLING_INTERVALS).default("month"),
        // Add-ons chosen on the checkout page (id → quantity). Omitted → carry over
        // the org's current add-ons. Unknown ids are ignored downstream.
        addons: z.record(z.string(), z.coerce.number().int().min(0).max(1000)).optional(),
      }),
      req.body,
    );
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");
    if (plan === "enterprise") {
      throw Errors.badRequest("Enterprise is sales-assisted — contact sales to upgrade.");
    }

    const result = await createEmbeddedCheckout(org, plan, interval, addons);
    if (result.mode === "embedded" && result.client_secret && result.publishable_key) {
      return {
        object: "embedded_checkout",
        available: true,
        client_secret: result.client_secret,
        publishable_key: result.publishable_key,
      };
    }
    return { object: "embedded_checkout", available: false };
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

    // In Stripe mode, add-ons bill as subscription items, so the org needs an
    // active subscription to attach them to (free orgs have none → upgrade first).
    if (BILLING_MODE === "stripe" && !org.stripeSubscriptionId) {
      throw Errors.badRequest("Start a paid plan before adding add-ons.");
    }

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
        throw Errors.badRequest("Couldn't update your subscription — please try again.");
      }
    }
    return billingPayload(org, await quotaState(org));
  });

  // Direct plan switch — local mode only.
  app.post("/v1/billing/plan", async (req) => {
    const { plan } = parse(z.object({ plan: z.enum(PLAN_IDS) }), req.body);
    const org = await orgForReq(req);
    await requirePermission(req, "billing.manage");
    if (BILLING_MODE === "stripe") {
      throw Errors.badRequest("Stripe billing is enabled — use POST /v1/billing/checkout.");
    }
    const [updated] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", updatedAt: new Date() })
      .where(eq(organizations.id, org.id))
      .returning();
    return billingPayload(updated, await quotaState(updated));
  });
}
