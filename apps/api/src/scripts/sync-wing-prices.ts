import { closeDb } from "@rootmail/db";
import { refreshTierCache } from "../lib/wings";
import { refreshPlanCache } from "../lib/plans";
import { syncAllAddonPrices, syncAllTierPrices } from "../lib/stripe";

// One-off: provision Stripe products + prices for every paid wing tier (blocks
// volume-tiered; marketing per-contact quantity) AND every add-on (wing-agnostic,
// billed on the org-level add-ons subscription). Run once after `db:seed:wing-pricing`,
// on the api host so it has the Stripe secret + DB:
//   docker exec -w /app/apps/api rootmail-api-1 pnpm exec tsx src/scripts/sync-wing-prices.ts
// Idempotent-safe (re-running mints fresh prices + archives the old). No-op in local mode.
async function main(): Promise<void> {
  await refreshTierCache();
  await refreshPlanCache();
  const { synced } = await syncAllTierPrices();
  const { synced: addonSynced } = await syncAllAddonPrices();
  await refreshTierCache();
  await refreshPlanCache();
  console.log(`wing prices: ${synced} tier(s) + ${addonSynced} add-on(s) synced to Stripe`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
