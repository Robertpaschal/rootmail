import {
  ADD_ONS,
  ADD_ON_IDS,
  type AddOnId,
  BASE_SEATS,
  BASE_WORKSPACES,
  BLOCK_SIZE,
  blocksMonthlyPrice,
  defaultTierId,
  FREE_MK_CONTACTS,
  marketingDailyLimit,
  marketingMonthlyPrice,
  marketingSendAllowance,
  type PlanDef,
  type PlanFeature,
  type PlanId,
  type TierDef,
  txDailyLimit,
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
    perThousandCents: r.perThousandCents ?? undefined,
    sendsPerContact: r.sendsPerContact ?? undefined,
    dailyPerContact: r.dailyPerContact ?? undefined,
    includedAudiences: r.includedAudiences ?? undefined,
    seats: r.seats ?? undefined,
    workspaceLimit: r.workspaceLimit ?? undefined,
    stripePriceMonthId: r.stripePriceMonthId,
    stripePriceYearId: r.stripePriceYearId,
    stripeOveragePriceId: r.stripeOveragePriceId,
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
  marketingContacts?: number | null;
  platformTier?: string | null;
  /** rootmail's own account. Not a customer, so not on a plan — see below. */
  isInternal?: boolean | null;
}

/**
 * Every feature there is. rootmail's own account holds all of them.
 *
 * We are not a customer of ourselves: the internal org has no tier, no
 * subscription and no Stripe id on purpose, because a fake Enterprise plan
 * would put revenue that does not exist into our own reporting. But entitlements
 * were derived from the tier alone, so "no tier" resolved to "Free" and our own
 * account was locked out of sequences, roles, proof and sub-tenants. We could
 * not run an onboarding sequence for our own customers — in the product whose
 * entire pitch is running onboarding sequences.
 *
 * A paywall is a billing relationship. There is no billing relationship here, so
 * there is nothing to enforce. This is NOT a free upgrade to Enterprise: volume
 * still counts (we want to feel our own limits), and the shape of the account is
 * still constrained (one workspace). It only says the till does not apply to the
 * people running the till.
 */
const ALL_FEATURES: PlanFeature[] = [
  "audit",
  "suppression",
  "subtenants",
  "threads",
  "sequences",
  "campaigns",
  "rbac",
  "proof",
  "dedicated_ip",
  "sso",
  "residency",
];

function tierFor(wing: Wing, id: string | null | undefined): TierDef {
  return getTier(id ?? "") ?? getTier(defaultTierId(wing))!; // constant fallback guarantees a hit
}
export const txTierFor = (org: WingOrg): TierDef => tierFor("transactional", org.transactionalTier);
export const mkTierFor = (org: WingOrg): TierDef => tierFor("marketing", org.marketingTier);
/** The invisible free platform base (seats/workspaces); Platform-as-a-plan is gone. */
export const platformBase = (): TierDef => getTier(defaultTierId("platform"))!;

const UNLIMITED_SENDS = Number.MAX_SAFE_INTEGER;

/** Monthly TRANSACTIONAL send allowance: blocks × BLOCK_SIZE when blocks are
 * purchased, else the tier's included sends (Free 3k). */
export function txSendAllowance(org: WingOrg): number {
  const tx = txTierFor(org);
  if (tx.includedSends === -1) return UNLIMITED_SENDS;
  const blocks = org.transactionalBlocks ?? 0;
  if (blocks > 0) return blocks * (tx.blockSize ?? BLOCK_SIZE);
  return tx.includedSends ?? 0;
}

/** Per-DAY transactional cap: blocks × the tier's per-block daily allowance (or
 * the Free daily cap with no blocks). The same number the pricing pages market. */
export function txDailyLimitForOrg(org: WingOrg): number {
  return txDailyLimit(txTierFor(org), org.transactionalBlocks ?? 0);
}

// --- Marketing: contact SIZE is the base; the tier multiplies it ---------------
/** Effective contact size the marketing tier works on (Free → the free ceiling). */
export function mkEffectiveContacts(org: WingOrg): number {
  const mk = mkTierFor(org);
  if (mk.id === "mk_free") return FREE_MK_CONTACTS;
  return org.marketingContacts ?? 0;
}
/** Monthly marketing send allowance = contacts × the tier's multiplier. */
export function marketingSendAllowanceForOrg(org: WingOrg): number {
  return marketingSendAllowance(mkTierFor(org), org.marketingContacts ?? 0);
}
/** Per-day marketing send cap = contacts × the tier's daily multiplier. */
export function marketingDailyLimitForOrg(org: WingOrg): number {
  return marketingDailyLimit(mkTierFor(org), org.marketingContacts ?? 0);
}
/** Monthly $ the marketing wing bills for this org (price = contacts × tier rate). */
export function marketingPriceForOrg(org: WingOrg): number {
  return marketingMonthlyPrice(mkTierFor(org), org.marketingContacts ?? 0);
}

/** The org's effective plan, synthesized from its wings — THE resolver. Quota =
 * transactional allowance (blocks-aware); seats/workspaces = the free base (extras
 * are add-ons); price = blocks + marketing (contacts × rate). Tier features only —
 * add-on-granted features are combined at the gate (`effectiveFeatures`). */
export function synthesizePlan(org: WingOrg): PlanDef {
  const tx = txTierFor(org);
  const mk = mkTierFor(org);
  const pf = platformBase();
  const blocks = org.transactionalBlocks ?? 0;
  const features = [...new Set<PlanFeature>([...tx.features, ...mk.features])];
  const txPrice = blocks > 0 ? blocksMonthlyPrice(blocks) : 0;
  return {
    id: org.plan, // vestigial label; entitlements come from the numeric fields below
    name: "Per-wing",
    price: txPrice + marketingPriceForOrg(org),
    monthlyQuota: txSendAllowance(org),
    allowOverage: blocks > 0 ? true : (tx.allowOverage ?? false),
    overagePer1000: tx.overagePer1000 ?? 0,
    includedSubTenants: 0, // client domains are an add-on now
    seats: pf.seats ?? BASE_SEATS,
    workspaceLimit: pf.workspaceLimit ?? BASE_WORKSPACES,
    features,
  };
}

/** Features an org's ADD-ONS grant (client domains, dedicated IP, roles, SSO,
 * proof, residency) — combined with tier features at the gate. */
export function featuresFromAddons(qty: Partial<Record<AddOnId, number>>): PlanFeature[] {
  const out: PlanFeature[] = [];
  for (const id of ADD_ON_IDS) {
    const f = ADD_ONS[id].grantsFeature;
    if (f && (qty[id] ?? 0) > 0) out.push(f);
  }
  return out;
}

/**
 * Effective feature set: tier features ∪ add-on-granted features.
 *
 * THE one seam both the 402 gate (`requireFeature`) and the entitlements the
 * dashboard draws locks from (`GET /v1/organization`) read, so they cannot
 * disagree about what an account may do.
 */
export function effectiveFeatures(org: WingOrg, qty: Partial<Record<AddOnId, number>>): PlanFeature[] {
  if (org.isInternal) return [...ALL_FEATURES];
  return [...new Set<PlanFeature>([...synthesizePlan(org).features, ...featuresFromAddons(qty)])];
}

/** Whether a feature is unlocked under the org's TIERS alone (add-on grants are
 * layered on by the async gate that also loads the org's add-ons). */
export function wingFeatureUnlocked(org: WingOrg, feature: PlanFeature): boolean {
  if (org.isInternal) return true;
  return synthesizePlan(org).features.includes(feature);
}

/** Billable contact limit: the free ceiling on Free, else the purchased size. */
export function contactLimitForOrg(org: WingOrg): number {
  // Our own account holds every customer we have. A contact ceiling here is a
  // bill we would be sending ourselves, and it would block the audience the
  // moment we grew — the most literal possible version of our own product
  // being unusable to us.
  if (org.isInternal) return -1;
  const mk = mkTierFor(org);
  if (mk.id === "mk_free") return mk.includedContacts ?? FREE_MK_CONTACTS;
  return org.marketingContacts ?? 0;
}

/** Distinct audiences (lists) the org's marketing tier allows (-1 = unlimited). */
export function audienceLimitForOrg(org: WingOrg): number {
  if (org.isInternal) return -1;
  return mkTierFor(org).includedAudiences ?? 1;
}

/** The lowest-rank tier that unlocks a feature (tier features only) — the upgrade
 * prompt on a 402. Add-on-granted features return undefined (see addonForFeature). */
export function requiredTierFor(feature: PlanFeature): TierDef | undefined {
  return WING_TIERS.filter((t) => t.features.includes(feature)).sort((a, b) => a.rank - b.rank)[0];
}
