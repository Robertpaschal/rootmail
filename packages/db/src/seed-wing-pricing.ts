import { WING_TIERS } from "@rootmail/core";
import { closeDb, db } from "./client";
import { pricingTiers } from "./schema";

// Seeds the three per-wing pricing ladders (PRICING-WINGS-SPEC.md) from the
// WING_TIERS constants into `pricing_tiers`. Idempotent + admin-safe: inserts only
// rows that don't exist yet (by id), so re-running never clobbers admin edits. To
// re-apply changed strawman numbers during dev, update the row (or delete + re-seed).
//   pnpm db:seed:wing-pricing
async function main(): Promise<void> {
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
