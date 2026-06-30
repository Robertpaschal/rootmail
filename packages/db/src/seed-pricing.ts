/**
 * Prod-safe pricing seed: populates the plan + add-on CATALOG tables from the
 * constants (idempotent), WITHOUT the demo org / API keys the full db:seed
 * creates. Run once per environment so the admin /pricing page has rows to edit
 * (the customer-facing /v1/pricing works off the constants cache regardless).
 *
 *   pnpm db:seed:pricing
 *   # prod (on the API host): docker compose --env-file .env.prod \
 *   #   -f docker-compose.prod.yml run --rm --no-deps api pnpm db:seed:pricing
 */
import { addons, closeDb, db, plans } from "./index";
import { ensureAddons, ensurePlans } from "./seed-catalog";

async function main(): Promise<void> {
  await ensurePlans();
  await ensureAddons();
  const p = await db.select({ id: plans.id }).from(plans);
  const a = await db.select({ id: addons.id }).from(addons);
  console.log(`✓ Catalog seeded — plans: ${p.length}, add-ons: ${a.length}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
