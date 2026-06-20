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
import { type Addon, addons as addonsTable, db, type Plan, plans as plansTable } from "@rootmail/db";

// Admin-editable plan economics live in the `plans` table. Reads happen on every
// send (quota), so we keep a small in-memory cache refreshed on boot, on a short
// TTL, and right after an admin edit. Anything missing falls back to the PLANS
// constants, so the app is never wedged by an empty/unreachable plans table.

const TTL_MS = 30_000;
let planCache: Record<PlanId, PlanDef> = { ...PLANS };
let aiCache: Record<PlanId, number> = { ...AI_CREDITS };
let stripePriceCache: Partial<Record<PlanId, { month: string | null; year: string | null }>> = {};
let trialCache: Partial<Record<PlanId, number>> = {};
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
    };
  }
  return out;
}

let addonCache: Record<AddOnId, AddOnInfo> = addonFallback();

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
      for (const r of rows) {
        if ((PLAN_IDS as readonly string[]).includes(r.id)) {
          p[r.id as PlanId] = toDef(r);
          ai[r.id as PlanId] = r.aiCredits;
          sp[r.id as PlanId] = { month: r.stripePriceMonthId, year: r.stripePriceYearId };
          tr[r.id as PlanId] = r.trialDays;
        }
      }
      planCache = p;
      aiCache = ai;
      stripePriceCache = sp;
      trialCache = tr;
    }

    const addonRows = await db.select().from(addonsTable);
    if (addonRows.length > 0) {
      const ac = addonFallback();
      for (const r of addonRows) {
        if ((ADD_ON_IDS as readonly string[]).includes(r.id)) ac[r.id as AddOnId] = toAddonInfo(r);
      }
      addonCache = ac;
    }
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
