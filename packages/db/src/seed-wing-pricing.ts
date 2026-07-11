import { inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { ADD_ON_IDS, ADD_ONS, defaultTierId, WING_TIERS } from "@rootmail/core";
import { closeDb, db } from "./client";
import { addons, organizations, pricingTiers } from "./schema";

// Reconciles `pricing_tiers` to the WING_TIERS catalog (PRICING-WINGS-SPEC.md):
// inserts missing tiers, REMOVES tiers that left the catalog (e.g. the fixed
// tx_starter/growth/scale rows replaced by the tx_blocks model), and repoints any
// org sitting on a removed transactional tier to tx_blocks (its block count keeps
// the entitlement). Existing rows keep admin edits (no overwrite). Idempotent.
//   pnpm db:seed:wing-pricing
async function main(): Promise<void> {
  const keepIds = WING_TIERS.map((t) => t.id);

  // Orgs on a removed tier move to the nearest surviving one (v3: no more
  // enterprise/contact-us tiers; Platform-as-a-plan is gone). Test data only.
  const movedTx = await db
    .update(organizations)
    .set({ transactionalTier: "tx_blocks", updatedAt: new Date() })
    .where(inArray(organizations.transactionalTier, ["tx_starter", "tx_growth", "tx_scale", "tx_enterprise"]))
    .returning({ id: organizations.id });
  if (movedTx.length) console.log(`repointed ${movedTx.length} org(s) to tx_blocks`);

  const movedMk = await db
    .update(organizations)
    .set({ marketingTier: "mk_pro", updatedAt: new Date() })
    .where(inArray(organizations.marketingTier, ["mk_enterprise"]))
    .returning({ id: organizations.id });
  if (movedMk.length) console.log(`repointed ${movedMk.length} org(s) to mk_pro`);

  // Platform is the free base now — everyone sits on pf_solo (extras are add-ons).
  const movedPf = await db
    .update(organizations)
    .set({ platformTier: "pf_solo", updatedAt: new Date() })
    .where(inArray(organizations.platformTier, ["pf_team", "pf_enterprise"]))
    .returning({ id: organizations.id });
  if (movedPf.length) console.log(`repointed ${movedPf.length} org(s) to pf_solo`);

  // Backfill: every org resolves through wings now — null tiers become that wing's
  // Free/entry tier explicitly (test accounts only; there are no real users).
  const backfilled = await db
    .update(organizations)
    .set({
      // Only fill the wings that are actually null — never clobber a real tier.
      transactionalTier: sql`coalesce(${organizations.transactionalTier}, ${defaultTierId("transactional")})`,
      marketingTier: sql`coalesce(${organizations.marketingTier}, ${defaultTierId("marketing")})`,
      platformTier: sql`coalesce(${organizations.platformTier}, ${defaultTierId("platform")})`,
      updatedAt: new Date(),
    })
    .where(
      or(
        isNull(organizations.transactionalTier),
        isNull(organizations.marketingTier),
        isNull(organizations.platformTier),
      ),
    )
    .returning({ id: organizations.id });
  if (backfilled.length) console.log(`backfilled ${backfilled.length} org(s) onto wing defaults`);

  const removed = await db
    .delete(pricingTiers)
    .where(notInArray(pricingTiers.id, keepIds))
    .returning({ id: pricingTiers.id });
  if (removed.length) console.log(`removed stale tiers: ${removed.map((r) => r.id).join(", ")}`);

  let inserted = 0;
  for (const t of WING_TIERS) {
    // v3 changed the tier SHAPE (marketing is contact-size driven, tiers grant no
    // AI/features that moved to add-ons), so upsert the economic columns to the
    // catalog — but never touch the synced Stripe price ids (sync-wing-prices owns
    // those). Test data only, so overwriting is safe + correct here.
    const shape = {
      wing: t.wing,
      name: t.name,
      rank: t.rank,
      priceMonthly: t.priceMonthly,
      priceYearly: t.priceYearly,
      aiCredits: t.aiCredits,
      features: t.features,
      trialDays: t.trialDays,
      active: true,
      includedSends: t.includedSends ?? null,
      blockSize: t.blockSize ?? null,
      allowOverage: t.allowOverage ?? false,
      overagePer1000Cents: Math.round((t.overagePer1000 ?? 0) * 100),
      includedSubTenants: t.includedSubTenants ?? 0,
      includedContacts: t.includedContacts ?? null,
      perThousandCents: t.perThousandCents ?? null,
      sendsPerContact: t.sendsPerContact ?? null,
      dailyPerContact: t.dailyPerContact ?? null,
      seats: t.seats ?? null,
      workspaceLimit: t.workspaceLimit ?? null,
    };
    const res = await db
      .insert(pricingTiers)
      .values({ id: t.id, ...shape })
      .onConflictDoUpdate({ target: pricingTiers.id, set: { ...shape, updatedAt: new Date() } })
      .returning({ id: pricingTiers.id });
    if (res.length) inserted++;
  }
  console.log(`wing pricing seed: ${inserted} tier(s) reconciled to the catalog`);

  // v3 also reshaped the ADD-ONS (Platform-as-a-plan dissolved into them): new
  // per-one prices/units/grants + 4 new capability add-ons (roles/SSO/proof/
  // residency). Upsert the catalog SHAPE, but never touch the synced Stripe price
  // ids or an active sale (those are owned by admin sync / promotions).
  let addonN = 0;
  for (let i = 0; i < ADD_ON_IDS.length; i++) {
    const id = ADD_ON_IDS[i];
    const a = ADD_ONS[id];
    const shape = {
      name: a.name,
      description: a.description,
      unit: a.unit,
      unitAmount: a.defaultUnitAmount,
      grant: a.grant,
      rank: i,
      active: true,
    };
    await db
      .insert(addons)
      .values({ id, ...shape })
      .onConflictDoUpdate({ target: addons.id, set: { ...shape, updatedAt: new Date() } });
    addonN++;
  }
  console.log(`add-on catalog: ${addonN} reconciled`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
