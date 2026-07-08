import { closeDb } from "@rootmail/db";
import { refreshTierCache } from "../lib/wings";
import { syncAllTierPrices } from "../lib/stripe";

// One-off: provision Stripe products + monthly/yearly prices for every paid wing
// tier (PRICING-WINGS-SPEC.md, Phase D). Run once after `db:seed:wing-pricing`, on
// the api host so it has the Stripe secret + DB:
//   docker exec -w /app/apps/api rootmail-api-1 pnpm exec tsx src/scripts/sync-wing-prices.ts
// Idempotent-safe (re-running mints fresh prices + archives the old, like an admin
// plan-price edit). No-op in local mode (Stripe unconfigured).
async function main(): Promise<void> {
  await refreshTierCache();
  const { synced } = await syncAllTierPrices();
  await refreshTierCache(); // pick the new price ids into the cache
  console.log(`wing prices: ${synced} tier(s) synced to Stripe`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
