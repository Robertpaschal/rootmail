import { inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { defaultTierId, WING_TIERS } from "@rootmail/core";
import { closeDb, db } from "./client";
import { organizations, pricingTiers } from "./schema";

// Reconciles `pricing_tiers` to the WING_TIERS catalog (PRICING-WINGS-SPEC.md):
// inserts missing tiers, REMOVES tiers that left the catalog (e.g. the fixed
// tx_starter/growth/scale rows replaced by the tx_blocks model), and repoints any
// org sitting on a removed transactional tier to tx_blocks (its block count keeps
// the entitlement). Existing rows keep admin edits (no overwrite). Idempotent.
//   pnpm db:seed:wing-pricing
async function main(): Promise<void> {
  const keepIds = WING_TIERS.map((t) => t.id);

  // Orgs on a to-be-removed transactional tier move to the blocks model.
  const moved = await db
    .update(organizations)
    .set({ transactionalTier: "tx_blocks", updatedAt: new Date() })
    .where(inArray(organizations.transactionalTier, ["tx_starter", "tx_growth", "tx_scale"]))
    .returning({ id: organizations.id });
  if (moved.length) console.log(`repointed ${moved.length} org(s) to tx_blocks`);

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
    const res = await db
      .insert(pricingTiers)
      .values({
        id: t.id,
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
        seats: t.seats ?? null,
        workspaceLimit: t.workspaceLimit ?? null,
      })
      .onConflictDoNothing({ target: pricingTiers.id })
      .returning({ id: pricingTiers.id });
    if (res.length) inserted++;
  }
  console.log(`wing pricing seed: ${inserted} inserted, ${WING_TIERS.length - inserted} already present`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
