import {
  defaultTierId,
  type PlanDef,
  type PlanFeature,
  type PlanId,
  type TierDef,
  type Wing,
  WING_TIERS,
} from "@rootmail/core";
import { db, type PricingTier, pricingTiers as pricingTiersTable } from "@rootmail/db";

// Per-wing pricing resolution (PRICING-WINGS-SPEC.md, Phase B).
//
// SAFETY: everything here is DORMANT until an org has at least one wing-tier column
// set (transactional/marketing/platform). No org does yet (assignment arrives in
// Phase C/D), so `orgHasWingPricing` is false everywhere and the callers
// (planForOrg / aiCreditsForOrg / requireFeature) all take their unchanged legacy
// branch. This lets us land + validate the machinery with zero behaviour change.

// --- tier catalog cache (DB override, WING_TIERS constant fallback — like plans) ---
const TTL_MS = 30_000;
let cache = new Map<string, TierDef>(WING_TIERS.map((t) => [t.id, t]));
let loadedAt = 0;

function toDef(r: PricingTier): TierDef {
  return {
    id: r.id,
    wing: r.wing as Wing,
    name: r.name,
    rank: r.rank,
    priceMonthly: r.priceMonthly,
    priceYearly: r.priceYearly,
    aiCredits: r.aiCredits,
    features: (r.features as PlanFeature[]) ?? [],
    trialDays: r.trialDays,
    includedSends: r.includedSends ?? undefined,
    blockSize: r.blockSize ?? undefined,
    allowOverage: r.allowOverage,
    overagePer1000: r.overagePer1000Cents / 100,
    includedSubTenants: r.includedSubTenants,
    includedContacts: r.includedContacts ?? undefined,
    seats: r.seats ?? undefined,
    workspaceLimit: r.workspaceLimit ?? undefined,
  };
}

export async function refreshTierCache(): Promise<void> {
  try {
    const rows = await db.select().from(pricingTiersTable);
    if (rows.length > 0) {
      const m = new Map<string, TierDef>(WING_TIERS.map((t) => [t.id, t]));
      for (const r of rows) m.set(r.id, toDef(r));
      cache = m;
    }
    loadedAt = Date.now();
  } catch {
    /* keep the last good cache (or the constants) */
  }
}

function maybeRefresh(): void {
  if (Date.now() - loadedAt > TTL_MS) void refreshTierCache();
}

/** A tier by id (cached, DB-backed, constant fallback). */
export function getTier(id: string): TierDef | undefined {
  maybeRefresh();
  return cache.get(id);
}

/** All tiers for a wing, in rank order (cached). */
export function tiersForWing(wing: Wing): TierDef[] {
  maybeRefresh();
  return [...cache.values()].filter((t) => t.wing === wing).sort((a, b) => a.rank - b.rank);
}

// --- org → per-wing resolution -------------------------------------------------
/** The org shape these resolvers read — the three wing-tier columns (+ plan). */
export interface WingOrg {
  plan: PlanId;
  transactionalTier?: string | null;
  marketingTier?: string | null;
  platformTier?: string | null;
}

/** True once an org has moved onto the per-wing model (any wing tier assigned).
 * While false (every org today), the legacy single-plan path is used untouched. */
export function orgHasWingPricing(org: WingOrg): boolean {
  return !!(org.transactionalTier || org.marketingTier || org.platformTier);
}

function tierFor(wing: Wing, id: string | null | undefined): TierDef {
  return getTier(id ?? "") ?? getTier(defaultTierId(wing))!; // constant fallback guarantees a hit
}
export const txTierFor = (org: WingOrg): TierDef => tierFor("transactional", org.transactionalTier);
export const mkTierFor = (org: WingOrg): TierDef => tierFor("marketing", org.marketingTier);
export const platformTierFor = (org: WingOrg): TierDef => tierFor("platform", org.platformTier);

const UNLIMITED_SENDS = Number.MAX_SAFE_INTEGER;

/** Synthesize a legacy-shaped PlanDef from the org's three wing tiers, so every
 * existing caller of planForOrg keeps working unchanged. Quota comes from the
 * transactional tier, seats/workspaces from platform, features are the union. */
export function synthesizePlan(org: WingOrg): PlanDef {
  const tx = txTierFor(org);
  const mk = mkTierFor(org);
  const pf = platformTierFor(org);
  const features = [...new Set<PlanFeature>([...tx.features, ...mk.features, ...pf.features])];
  const price =
    tx.priceMonthly === null || mk.priceMonthly === null || pf.priceMonthly === null
      ? null // any custom wing → custom overall
      : (tx.priceMonthly ?? 0) + (mk.priceMonthly ?? 0) + (pf.priceMonthly ?? 0);
  return {
    id: org.plan, // nominal label; entitlements come from the numeric fields below
    name: "Custom (per-wing)",
    price,
    monthlyQuota: tx.includedSends === -1 ? UNLIMITED_SENDS : (tx.includedSends ?? 0),
    allowOverage: tx.allowOverage ?? false,
    overagePer1000: tx.overagePer1000 ?? 0,
    includedSubTenants: tx.includedSubTenants ?? 0,
    seats: pf.seats ?? 1,
    workspaceLimit: pf.workspaceLimit ?? 1,
    features,
  };
}

/** Org-level AI credits from the three wing tiers (summed; -1 = unlimited wins). */
export function wingAiCredits(org: WingOrg): number {
  const grants = [txTierFor(org).aiCredits, mkTierFor(org).aiCredits, platformTierFor(org).aiCredits];
  if (grants.some((g) => g === -1)) return -1;
  return grants.reduce((a, b) => a + b, 0);
}

/** Whether a feature is unlocked under the org's per-wing tiers (union across wings). */
export function wingFeatureUnlocked(org: WingOrg, feature: PlanFeature): boolean {
  return synthesizePlan(org).features.includes(feature);
}

/** Billable contact limit under the marketing tier (-1 = unlimited). Only meaningful
 * for wing-priced orgs; legacy orgs have no contact cap (return -1). */
export function contactLimitForOrg(org: WingOrg): number {
  if (!orgHasWingPricing(org)) return -1;
  return mkTierFor(org).includedContacts ?? -1;
}

/** The lowest-rank tier that unlocks a feature — for the upgrade prompt on a
 * wing-priced org's 402. A feature lives in one wing, so this returns that wing's
 * cheapest tier that includes it. */
export function requiredTierFor(feature: PlanFeature): TierDef | undefined {
  return WING_TIERS.filter((t) => t.features.includes(feature)).sort((a, b) => a.rank - b.rank)[0];
}
