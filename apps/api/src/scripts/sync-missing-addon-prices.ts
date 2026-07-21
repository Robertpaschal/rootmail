import { closeDb } from "@rootmail/db";
import { refreshTierCache } from "../lib/wings";
import { syncMissingAddonPrices } from "../lib/stripe";

// Mint Stripe prices for any priced add-on that doesn't have one yet (e.g. a newly
// seeded pack like contact_pack / audience_pack). SAFE on prod — it never re-mints an
// existing add-on's price, so live subscriptions keep mapping to their current ids.
// Run after `db:seed:wing-pricing` on the api host (needs Stripe secret + DB):
//   docker exec -w /app/apps/api rootmail-api-1 pnpm exec tsx src/scripts/sync-missing-addon-prices.ts
async function main(): Promise<void> {
  await refreshTierCache();
  const { synced } = await syncMissingAddonPrices();
  console.log(
    synced.length ? `minted Stripe prices for: ${synced.join(", ")}` : "no add-ons were missing a price",
  );
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
