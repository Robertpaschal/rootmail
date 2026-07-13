/**
 * One-shot: mint YEARLY Stripe prices for any add-on that only has a monthly one,
 * so add-ons can ride yearly wing checkouts as real line items (one bill).
 * Safe to re-run (skips add-ons that already have a yearly price). Run on the API
 * host after deploying the one-bill checkout:
 *   docker exec -w /app/apps/api rootmail-api-1 pnpm exec tsx src/scripts/sync-addon-yearly.ts
 */
import { closeDb } from "@rootmail/db";
import { ensureAddonYearlyPrices } from "../lib/stripe";

ensureAddonYearlyPrices()
  .then(async (r) => {
    console.log(`addon yearly prices: ${r.minted} minted`);
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
