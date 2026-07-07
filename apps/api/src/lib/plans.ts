import {
  ADD_ON_IDS,
  ADD_ONS,
  type AddOnId,
  AI_CREDITS,
  PLAN_IDS,
  PLANS,
  type PlanDef,
  type PlanFeature,
  type PlanId,
} from "@rootmail/core";
import { eq } from "drizzle-orm";
import {
  type Addon,
  addons as addonsTable,
  type CustomPlan,
  customPlans as customPlansTable,
  db,
  type Plan,
  plans as plansTable,
} from "@rootmail/db";
import {
  orgHasWingPricing,
  synthesizePlan,
  wingAiCredits,
  type WingOrg,
} from "./wings";

// Admin-editable plan economics live in the `plans` table. Reads happen on every
// send (quota), so we keep a small in-memory cache refreshed on boot, on a short
// TTL, and right after an admin edit. Anything missing falls back to the PLANS
// constants, so the app is never wedged by an empty/unreachable plans table.

const TTL_MS = 30_000;
let planCache: Record<PlanId, PlanDef> = { ...PLANS };
let aiCache: Record<PlanId, number> = { ...AI_CREDITS };
let stripePriceCache: Partial<Record<PlanId, { month: string | null; year: string | null }>> = {};
let trialCache: Partial<Record<PlanId, number>> = {};
export interface PlanSale {
  percentOff: number;
  endsAt: Date | null;
  couponId: string | null;
}
let saleCache: Partial<Record<PlanId, PlanSale>> = {};
let loadedAt = 0;

export interface AddOnInfo {
  id: AddOnId;
  name: string;
  description: string;
  unit: string;
  unitAmount: number; // monthly USD per unit
  grant: number;
  active: boolean;
  stripePriceId: string | null;
  // Public sale (like plans): a % off + a discounted Stripe "sale price" used
  // while active. null = no sale.
  salePercentOff: number | null;
  saleEndsAt: Date | null;
  saleStripePriceId: string | null;
}

function addonFallback(): Record<AddOnId, AddOnInfo> {
  const out = {} as Record<AddOnId, AddOnInfo>;
  for (const id of ADD_ON_IDS) {
    const a = ADD_ONS[id];
    out[id] = {
      id,
      name: a.name,
      description: a.description,
      unit: a.unit,
      unitAmount: a.defaultUnitAmount,
      grant: a.grant,
      active: true,
      stripePriceId: null,
      salePercentOff: null,
      saleEndsAt: null,
      saleStripePriceId: null,
    };
  }
  return out;
}

let addonCache: Record<AddOnId, AddOnInfo> = addonFallback();

// Per-org bespoke enterprise plans, keyed by organization id. Only ACTIVE plans
// are cached; an org with one runs on enterprise features but these economics.
let customPlanCache = new Map<string, { def: PlanDef; aiCredits: number }>();

function toCustomDef(cp: CustomPlan): { def: PlanDef; aiCredits: number } {
  return {
    def: {
      id: "enterprise", // inherit enterprise's feature unlocks
      name: cp.name,
      price: cp.priceCents / 100,
      monthlyQuota: cp.monthlyQuota,
      allowOverage: cp.allowOverage,
      overagePer1000: cp.overagePer1000Cents / 100,
      includedSubTenants: cp.includedSubTenants,
      seats: cp.seats,
      // Custom plans are bespoke enterprise deals → unlimited workspaces, like
      // the enterprise tier they inherit features from.
      workspaceLimit: -1,
      features: PLANS.enterprise.features,
    },
    aiCredits: cp.aiCredits,
  };
}

function toAddonInfo(r: Addon): AddOnInfo {
  return {
    id: r.id as AddOnId,
    name: r.name,
    description: r.description,
    unit: r.unit,
    unitAmount: r.unitAmount,
    grant: r.grant,
    active: r.active,
    stripePriceId: r.stripePriceId,
    salePercentOff: r.salePercentOff,
    saleEndsAt: r.saleEndsAt,
    saleStripePriceId: r.saleStripePriceId,
  };
}

function toDef(r: Plan): PlanDef {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    monthlyQuota: r.monthlyQuota,
    allowOverage: r.allowOverage,
    overagePer1000: r.overagePer1000Cents / 100,
    includedSubTenants: r.includedSubTenants,
    seats: r.seats,
    workspaceLimit: r.workspaceLimit,
    features: r.features as PlanFeature[],
  };
}

/** Reload the plan cache from the DB. Best-effort: keeps the last good cache on error. */
export async function refreshPlanCache(): Promise<void> {
  try {
    const rows = await db.select().from(plansTable);
    if (rows.length > 0) {
      const p = { ...PLANS };
      const ai = { ...AI_CREDITS };
      const sp: Partial<Record<PlanId, { month: string | null; year: string | null }>> = {};
      const tr: Partial<Record<PlanId, number>> = {};
      const sl: Partial<Record<PlanId, PlanSale>> = {};
      for (const r of rows) {
        if ((PLAN_IDS as readonly string[]).includes(r.id)) {
          p[r.id as PlanId] = toDef(r);
          ai[r.id as PlanId] = r.aiCredits;
          sp[r.id as PlanId] = { month: r.stripePriceMonthId, year: r.stripePriceYearId };
          tr[r.id as PlanId] = r.trialDays;
          sl[r.id as PlanId] = {
            percentOff: r.salePercentOff ?? 0,
            endsAt: r.saleEndsAt,
            couponId: r.saleStripeCouponId,
          };
        }
      }
      planCache = p;
      aiCache = ai;
      stripePriceCache = sp;
      trialCache = tr;
      saleCache = sl;
    }

    const addonRows = await db.select().from(addonsTable);
    if (addonRows.length > 0) {
      const ac = addonFallback();
      for (const r of addonRows) {
        if ((ADD_ON_IDS as readonly string[]).includes(r.id)) ac[r.id as AddOnId] = toAddonInfo(r);
      }
      addonCache = ac;
    }

    const customRows = await db
      .select()
      .from(customPlansTable)
      .where(eq(customPlansTable.active, true));
    const cp = new Map<string, { def: PlanDef; aiCredits: number }>();
    for (const r of customRows) cp.set(r.organizationId, toCustomDef(r));
    customPlanCache = cp;

    loadedAt = Date.now();
  } catch {
    /* keep the last good cache (or constants) */
  }
}

function maybeRefresh(): void {
  if (Date.now() - loadedAt > TTL_MS) void refreshPlanCache();
}

/** Plan definition for a plan id (cached, DB-backed, constant fallback). */
export function getPlan(planId: PlanId): PlanDef {
  maybeRefresh();
  return planCache[planId] ?? PLANS.free;
}

/**
 * Effective plan economics for an org — a per-org custom (enterprise) plan wins
 * over the standard tier, otherwise the tier's catalog definition. This is the
 * single hot-path resolver: quota, overage, seats, and sub-tenant limits all flow
 * through it, so a custom plan is enforced exactly as it was sold.
 */
export function planForOrg(org: WingOrg & { id: string }): PlanDef {
  maybeRefresh();
  // Per-wing pricing wins when assigned. DORMANT today — no org has a wing tier set,
  // so this is skipped and the legacy custom/tier resolution below runs unchanged.
  if (orgHasWingPricing(org)) return synthesizePlan(org);
  const custom = customPlanCache.get(org.id);
  return custom ? custom.def : getPlan(org.plan);
}

/** Effective monthly AI credits for an org (custom plan wins; -1 = unlimited). */
export function aiCreditsForOrg(org: WingOrg & { id: string }): number {
  maybeRefresh();
  if (orgHasWingPricing(org)) return wingAiCredits(org);
  const custom = customPlanCache.get(org.id);
  return custom ? custom.aiCredits : getAiCredits(org.plan);
}

/** Effective included live workspaces for an org (custom plan wins; -1 = unlimited). */
export function workspaceLimitForOrg(org: WingOrg & { id: string }): number {
  return planForOrg(org).workspaceLimit;
}

/** Admin-synced Stripe price ids for a plan, if any (else null → use env). */
export function getStripePrices(planId: PlanId): { month: string | null; year: string | null } | undefined {
  maybeRefresh();
  return stripePriceCache[planId];
}

/** Free-trial length in days for a plan's checkout (0 = no trial). */
export function getTrialDays(planId: PlanId): number {
  maybeRefresh();
  return trialCache[planId] ?? 0;
}

/** Current sale for a plan, if any (percentOff 0 = no sale). */
export function getSale(planId: PlanId): PlanSale | undefined {
  maybeRefresh();
  return saleCache[planId];
}

/** Add-on definition (cached, DB-backed, constant fallback). */
export function getAddon(id: AddOnId): AddOnInfo {
  maybeRefresh();
  return addonCache[id] ?? addonFallback()[id];
}

/** All add-ons in catalog order. */
export function listAddons(): AddOnInfo[] {
  maybeRefresh();
  return ADD_ON_IDS.map((id) => addonCache[id]);
}

/** Included monthly AI credits for a plan (-1 = unlimited). */
export function getAiCredits(planId: PlanId): number {
  maybeRefresh();
  return aiCache[planId] ?? 0;
}

/** All plans in tier order. */
export function listPlans(): PlanDef[] {
  maybeRefresh();
  return PLAN_IDS.map((id) => planCache[id] ?? PLANS[id]);
}
