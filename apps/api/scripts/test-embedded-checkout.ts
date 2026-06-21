/**
 * Embedded (on-page) checkout endpoint — needs the API running (`pnpm api`), no seed.
 *   - POST /v1/billing/checkout/embedded returns a session client_secret +
 *     publishable key when STRIPE_PUBLISHABLE_KEY is set; otherwise { available:
 *     false } so the dashboard falls back to hosted checkout
 *   - enterprise is blocked (sales-assisted)
 * Creates a throwaway org/workspace/key and cleans up (incl. any Stripe customer).
 */
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env, generateApiKey, newId } from "@rootmail/core";
import { apiKeys, closeDb, db, orgAddons, organizations, workspaces } from "@rootmail/db";
import { getStripe, priceForAddOn, reconcileAddonsFromSubscription } from "../src/lib/stripe";
import { refreshPlanCache } from "../src/lib/plans";

const API = "http://localhost:4000";
const TAG = `embedtest+${Date.now()}`;

let pass = true;
function check(cond: boolean, label: string): void {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) pass = false;
}
const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

async function main(): Promise<void> {
  let up = false;
  try {
    up = (await fetch(`${API}/health`)).ok;
  } catch {
    up = false;
  }
  if (!up) {
    console.error(`API not reachable at ${API} — start it with \`pnpm api\`.`);
    process.exit(1);
  }

  const orgId = newId("organization");
  const wsId = newId("workspace");
  await db.insert(organizations).values({ id: orgId, name: "Embed Buyer", slug: TAG, plan: "free" });
  await db
    .insert(workspaces)
    .values({ id: wsId, organizationId: orgId, name: "Prod", slug: "production", environment: "live" });
  const key = generateApiKey("live");
  await db.insert(apiKeys).values({
    id: newId("apiKey"),
    workspaceId: wsId,
    name: "embed-test",
    prefix: key.prefix,
    last4: key.last4,
    keyHash: key.hash,
    mode: "live",
  });
  const H = { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" };
  const hasPk = !!env.STRIPE_PUBLISHABLE_KEY;
  const stripe = getStripe();

  try {
    // Enterprise is sales-assisted → blocked.
    const ent = await fetch(`${API}/v1/billing/checkout/embedded`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ plan: "enterprise" }),
    });
    check(ent.status === 400, `enterprise embedded checkout → 400 (got ${ent.status})`);

    // Pro: embedded session when a publishable key is configured, else graceful
    // fallback signal.
    const res = await fetch(`${API}/v1/billing/checkout/embedded`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ plan: "pro", interval: "month" }),
    });
    check(res.status === 200, `pro embedded checkout → 200 (got ${res.status})`);
    const body = await json(res);
    check(body.object === "embedded_checkout", "returns an embedded_checkout object");

    if (hasPk && stripe) {
      check(body.available === true, "embedded available (publishable key set)");
      check(typeof body.client_secret === "string", "returns a session client_secret");
      check(typeof body.publishable_key === "string", "returns the publishable key");

      // Configure add-ons AT checkout → the session's line items reflect them.
      const cfg = await fetch(`${API}/v1/billing/checkout/embedded`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ plan: "pro", interval: "month", addons: { ai_credit_pack: 2 } }),
      });
      const cfgBody = await json(cfg);
      const cs = String(cfgBody.client_secret ?? "");
      const sessionId = cs.split("_secret_")[0];
      await refreshPlanCache();
      const aiPrice = priceForAddOn("ai_credit_pack");
      if (sessionId && aiPrice) {
        const full = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
        const items = full.line_items?.data ?? [];
        const aiItem = items.find((i) => i.price?.id === aiPrice);
        check(!!aiItem && aiItem.quantity === 2, "configured add-on (×2) is on the session line items");
      } else {
        check(false, "could not resolve session id / add-on price for the config check");
      }
    } else {
      check(body.available === false, "embedded reports unavailable (no publishable key) → caller falls back");
      console.log("NOTE — set STRIPE_PUBLISHABLE_KEY to exercise the on-page payment path.");
    }

    // Reconciliation: org_addons matches what a subscription bills (the source of
    // truth after a configure-at-checkout purchase).
    await refreshPlanCache();
    const aiPrice = priceForAddOn("ai_credit_pack");
    if (aiPrice) {
      const subWith = {
        id: "sub_test",
        status: "active",
        customer: "cus_test",
        metadata: {},
        items: { data: [{ price: { id: aiPrice }, quantity: 3 } ] },
      } as unknown as Stripe.Subscription;
      await reconcileAddonsFromSubscription(orgId, subWith);
      const aiRow = (
        await db.select().from(orgAddons).where(eq(orgAddons.organizationId, orgId))
      ).find((r) => r.addonId === "ai_credit_pack");
      check(aiRow?.quantity === 3, `reconcile sets org_addons from the sub (got ${aiRow?.quantity})`);

      // A sub without the add-on → reconcile zeroes it.
      const subWithout = {
        id: "sub_test2",
        status: "active",
        customer: "cus_test",
        metadata: {},
        items: { data: [] },
      } as unknown as Stripe.Subscription;
      await reconcileAddonsFromSubscription(orgId, subWithout);
      const aiRow2 = (
        await db.select().from(orgAddons).where(eq(orgAddons.organizationId, orgId))
      ).find((r) => r.addonId === "ai_credit_pack");
      check(aiRow2?.quantity === 0, `reconcile zeroes a removed add-on (got ${aiRow2?.quantity})`);
    }
  } finally {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (org?.stripeCustomerId && stripe) await stripe.customers.del(org.stripeCustomerId).catch(() => {});
    await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades workspace + key
  }

  console.log(pass ? "\nAll embedded-checkout checks passed." : "\nSome checks FAILED.");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
