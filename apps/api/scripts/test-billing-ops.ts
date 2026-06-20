/**
 * Billing-ops endpoint check — TEST MODE ONLY (needs the API running).
 *   pnpm --filter @rootmail/api test:billing-ops
 *
 * Creates a throwaway Stripe test customer + subscription, points a test org at
 * them, then drives the admin endpoints: GET /v1/admin/orgs/:id/billing (sub +
 * invoices) and POST /v1/admin/orgs/:id/credit (goodwill credit → balance).
 * Cleans up. No-op in local mode (no Stripe key).
 */
import { eq } from "drizzle-orm";
import { newId } from "@rootmail/core";
import { closeDb, db, organizations } from "@rootmail/db";
import { getStripe, priceForPlan } from "../src/lib/stripe";

const API = "http://localhost:4000";

async function main(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    console.log("Stripe not configured (local mode) — skipping.");
    await closeDb();
    return;
  }

  const login = await fetch(`${API}/v1/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@rootmail.io", password: "rootmail-admin" }),
  }).then((r) => r.json());
  const token: string | undefined = login.session_token;
  if (!token) {
    console.error("FAIL — staff login failed (is the API running? seed run?).");
    process.exit(1);
  }
  const planPrice = priceForPlan("pro");
  if (!planPrice) {
    console.error("FAIL — STRIPE_PRICE_PRO not set.");
    process.exit(1);
  }

  let pass = true;
  let customerId: string | undefined;
  let subId: string | undefined;
  let orgId: string | undefined;
  try {
    const customer = await stripe.customers.create({ name: "billing-ops-test" });
    customerId = customer.id;
    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: planPrice }],
    });
    subId = sub.id;

    orgId = newId("organization");
    await db.insert(organizations).values({
      id: orgId,
      name: "billing-ops-test",
      slug: `billing-ops-${orgId.slice(-6)}`,
      plan: "pro",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
    });

    const getBilling = () =>
      fetch(`${API}/v1/admin/orgs/${orgId}/billing`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());

    let b = await getBilling();
    const ok1 =
      b.subscription?.status === "active" &&
      b.subscription.items.length >= 1 &&
      b.invoices.length >= 1;
    console.log(
      `${ok1 ? "✓" : "✗"} billing detail — sub=${b.subscription?.status} items=${b.subscription?.items.length} invoices=${b.invoices.length}`,
    );
    pass &&= ok1;

    const credit = await fetch(`${API}/v1/admin/orgs/${orgId}/credit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount_cents: 500, reason: "test goodwill" }),
    }).then((r) => r.json());
    console.log(`${credit.applied ? "✓" : "✗"} grant $5 credit — applied=${credit.applied}`);
    pass &&= credit.applied === true;

    b = await getBilling();
    const ok2 = b.balance === -500;
    console.log(`${ok2 ? "✓" : "✗"} balance after credit — ${b.balance} (expect -500)`);
    pass &&= ok2;
  } finally {
    if (subId) await stripe.subscriptions.cancel(subId).catch(() => {});
    if (customerId) await stripe.customers.del(customerId).catch(() => {});
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => {});
  }

  console.log(pass ? "\nPASS — billing-ops verified in test mode" : "\nFAIL — see above");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
