import { AI_CREDITS, PLAN_IDS, PLANS, type PlanDef, type PlanFeature, type PlanId } from "@rootmail/core";
import { db, type Plan, plans as plansTable } from "@rootmail/db";

// Admin-editable plan economics live in the `plans` table. Reads happen on every
// send (quota), so we keep a small in-memory cache refreshed on boot, on a short
// TTL, and right after an admin edit. Anything missing falls back to the PLANS
// constants, so the app is never wedged by an empty/unreachable plans table.

const TTL_MS = 30_000;
let planCache: Record<PlanId, PlanDef> = { ...PLANS };
let aiCache: Record<PlanId, number> = { ...AI_CREDITS };
let stripePriceCache: Partial<Record<PlanId, { month: string | null; year: string | null }>> = {};
let loadedAt = 0;

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
      for (const r of rows) {
        if ((PLAN_IDS as readonly string[]).includes(r.id)) {
          p[r.id as PlanId] = toDef(r);
          ai[r.id as PlanId] = r.aiCredits;
          sp[r.id as PlanId] = { month: r.stripePriceMonthId, year: r.stripePriceYearId };
        }
      }
      planCache = p;
      aiCache = ai;
      stripePriceCache = sp;
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
