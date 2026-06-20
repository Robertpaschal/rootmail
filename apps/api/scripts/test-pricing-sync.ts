/**
 * Pricing Stripe-sync check — TEST MODE ONLY (needs the API running).
 *   pnpm --filter @rootmail/api test:pricing-sync
 *
 * Changes the Pro plan's billed price via the admin API and asserts a new Stripe
 * price (monthly + yearly) is created and linked, the product default is updated,
 * then restores the original amount and confirms the prior price is archived
 * (existing subs grandfathered). No-op in local mode (no Stripe key).
 */
import { closeDb } from "@rootmail/db";
import { getStripe } from "../src/lib/stripe";

const API = "http://localhost:4000";

async function staffToken(): Promise<string | undefined> {
  const j = await fetch(`${API}/v1/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@rootmail.io", password: "rootmail-admin" }),
  }).then((r) => r.json());
  return j.session_token;
}

async function main(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    console.log("Stripe not configured (local mode) — skipping.");
    await closeDb();
    return;
  }
  const token = await staffToken();
  if (!token) {
    console.error("FAIL — staff login (is the API running + seeded?).");
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${token}` };
  const jsonAuth = { ...auth, "Content-Type": "application/json" };

  const list = await fetch(`${API}/v1/admin/plans`, { headers: auth }).then((r) => r.json());
  const pro = list.data.find((p: { id: string }) => p.id === "pro") as { price: number };
  const original = pro.price;
  const bumped = original + 1;
  let pass = true;

  const patch = (await fetch(`${API}/v1/admin/plans/pro`, {
    method: "PATCH",
    headers: jsonAuth,
    body: JSON.stringify({ price: bumped }),
  }).then((r) => r.json())) as {
    stripe_sync: string;
    stripe_price_month_id: string;
    stripe_price_year_id: string;
  };
  console.log(`${patch.stripe_sync === "synced" ? "✓" : "✗"} PATCH pro $${original}→$${bumped}: stripe_sync=${patch.stripe_sync}`);
  pass &&= patch.stripe_sync === "synced";

  const month = await stripe.prices.retrieve(patch.stripe_price_month_id);
  const okMonth = month.unit_amount === bumped * 100 && month.recurring?.interval === "month" && month.active;
  console.log(`${okMonth ? "✓" : "✗"} new monthly price $${(month.unit_amount ?? 0) / 100}/${month.recurring?.interval} active=${month.active}`);
  pass &&= okMonth;

  const year = await stripe.prices.retrieve(patch.stripe_price_year_id);
  const okYear = year.unit_amount === bumped * 10 * 100 && year.recurring?.interval === "year";
  console.log(`${okYear ? "✓" : "✗"} new yearly price $${(year.unit_amount ?? 0) / 100}/${year.recurring?.interval}`);
  pass &&= okYear;

  const productId = typeof month.product === "string" ? month.product : month.product.id;
  const product = await stripe.products.retrieve(productId);
  const defId =
    typeof product.default_price === "string" ? product.default_price : product.default_price?.id;
  console.log(`${defId === month.id ? "✓" : "✗"} product default_price → new monthly`);
  pass &&= defId === month.id;

  // Restore — this creates a fresh synced price and archives the one above.
  const restore = (await fetch(`${API}/v1/admin/plans/pro`, {
    method: "PATCH",
    headers: jsonAuth,
    body: JSON.stringify({ price: original }),
  }).then((r) => r.json())) as { stripe_sync: string };
  const prior = await stripe.prices.retrieve(patch.stripe_price_month_id);
  console.log(`${prior.active === false ? "✓" : "✗"} prior synced price archived (grandfathered) — restore sync=${restore.stripe_sync}`);
  pass &&= prior.active === false;

  console.log(pass ? "\nPASS — Stripe price sync verified in test mode" : "\nFAIL — see above");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
