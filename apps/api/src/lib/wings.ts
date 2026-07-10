import {
  BLOCK_SIZE,
  blocksMonthlyPrice,
  defaultTierId,
  type PlanDef,
  type PlanFeature,
  type PlanId,
  type TierDef,
  type Wing,
  WING_TIERS,
} from "@rootmail/core";
import { db, type PricingTier, pricingTiers as pricingTiersTable } from "@rootmail/db";

// Per-wing pricing resolution (PRICING-WINGS-SPEC.md) — THE entitlements model.
// Every org resolves through its three wings (null tier = that wing's Free); the
// transactional wing is blocks-aware (organizations.transactional_blocks).

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
    stripePriceMonthId: r.stripePriceMonthId,
    stripePriceYearId: r.stripePriceYearId,
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
/** The org shape these resolvers read — the wing tiers + purchased blocks. Every
 * org resolves through wings: null tiers mean that wing's Free/entry tier. */
export interface WingOrg {
  plan: PlanId; // vestigial label only — entitlements come from the wings
  transactionalTier?: string | null;
  transactionalBlocks?: number | null;
  marketingTier?: string | null;
  platformTier?: string | null;
}

function tierFor(wing: Wing, id: string | null | undefined): TierDef {
  return getTier(id ?? "") ?? getTier(defaultTierId(wing))!; // constant fallback guarantees a hit
}
export const txTierFor = (org: WingOrg): TierDef => tierFor("transactional", org.transactionalTier);
export const mkTierFor = (org: WingOrg): TierDef => tierFor("marketing", org.marketingTier);
export const platformTierFor = (org: WingOrg): TierDef => tierFor("platform", org.platformTier);

const UNLIMITED_SENDS = Number.MAX_SAFE_INTEGER;

/** Monthly TRANSACTIONAL send allowance: blocks × BLOCK_SIZE when blocks are
 * purchased, else the tier's included sends (Free 3k; Enterprise unlimited). */
export function txSendAllowance(org: WingOrg): number {
  const tx = txTierFor(org);
  if (tx.includedSends === -1) return UNLIMITED_SENDS;
  const blocks = org.transactionalBlocks ?? 0;
  if (blocks > 0) return blocks * (tx.blockSize ?? BLOCK_SIZE);
  return tx.includedSends ?? 0;
}

/** The org's effective plan, synthesized from its three wings — THE resolver.
 * Quota = transactional allowance (blocks-aware), seats/workspaces = platform,
 * features = union. `monthlyQuota` governs TRANSACTIONAL sends only; marketing
 * volume is priced by contacts (contactLimitForOrg), never by send quota. */
export function synthesizePlan(org: WingOrg): PlanDef {
  const tx = txTierFor(org);
  const mk = mkTierFor(org);
  const pf = platformTierFor(org);
  const blocks = org.transactionalBlocks ?? 0;
  const features = [...new Set<PlanFeature>([...tx.features, ...mk.features, ...pf.features])];
  const txPrice = tx.priceMonthly === null ? null : blocks > 0 ? blocksMonthlyPrice(blocks) : 0;
  const price =
    txPrice === null || mk.priceMonthly === null || pf.priceMonthly === null
      ? null // any custom wing → custom overall
      : txPrice + (mk.priceMonthly ?? 0) + (pf.priceMonthly ?? 0);
  return {
    id: org.plan, // vestigial label; entitlements come from the numeric fields below
    name: "Per-wing",
    price,
    monthlyQuota: txSendAllowance(org),
    allowOverage: blocks > 0 ? true : (tx.allowOverage ?? false),
    overagePer1000: tx.overagePer1000 ?? 0,
    includedSubTenants: tx.includedSubTenants ?? 0,
    seats: pf.seats ?? 1,
    workspaceLimit: pf.workspaceLimit ?? 1,
    features,
  };
}

/** Org-level AI credits from the three wing tiers (summed; -1 = unlimited wins).
 * The transactional Blocks grant only applies once blocks are actually purchased. */
export function wingAiCredits(org: WingOrg): number {
  const tx = txTierFor(org);
  const txGrant = tx.id === "tx_blocks" && (org.transactionalBlocks ?? 0) === 0 ? 5 : tx.aiCredits;
  const grants = [txGrant, mkTierFor(org).aiCredits, platformTierFor(org).aiCredits];
  if (grants.some((g) => g === -1)) return -1;
  return grants.reduce((a, b) => a + b, 0);
}

/** Whether a feature is unlocked under the org's per-wing tiers (union across wings). */
export function wingFeatureUnlocked(org: WingOrg, feature: PlanFeature): boolean {
  return synthesizePlan(org).features.includes(feature);
}

/** Billable contact limit under the marketing tier (-1 = unlimited). */
export function contactLimitForOrg(org: WingOrg): number {
  return mkTierFor(org).includedContacts ?? -1;
}

/** The lowest-rank tier that unlocks a feature — for the upgrade prompt on a
 * wing-priced org's 402. A feature lives in one wing, so this returns that wing's
 * cheapest tier that includes it. */
export function requiredTierFor(feature: PlanFeature): TierDef | undefined {
  return WING_TIERS.filter((t) => t.features.includes(feature)).sort((a, b) => a.rank - b.rank)[0];
}
