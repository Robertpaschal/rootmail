/**
 * Plan sales / discounts flow — needs the API running (`pnpm api`), no seed. Runs
 * with or without Stripe (Stripe-mode assertions are skipped in local mode).
 * Operates on the real "pro" plan and ALWAYS clears the sale again in cleanup.
 *   - admin sets a sale → fields persisted + a synced Stripe coupon created
 *   - the cached resolver reports the sale (getSale) as active
 *   - admin plan list surfaces the sale
 *   - HONESTY: a customer checking out the on-sale plan gets the discount applied
 *     (checkout session shows a discount amount)
 *   - updating the sale swaps the coupon; clearing it deletes the coupon + fields
 * Creates throwaway staff (+ a throwaway org/workspace/key for the checkout check)
 * and cleans everything up.
 */
import { eq } from "drizzle-orm";
import { generateApiKey, hashPassword, newId } from "@rootmail/core";
import {
  addons,
  apiKeys,
  closeDb,
  db,
  organizations,
  plans,
  staffUsers,
  workspaces,
} from "@rootmail/db";
import { getAddon, getSale, refreshPlanCache } from "../src/lib/plans";
import { getStripe, priceForAddOn } from "../src/lib/stripe";

const API = "http://localhost:4000";
const TAG = `saletest+${Date.now()}`;

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

  const stripe = getStripe();
  const stripeOn = !!stripe;
  const staffId = newId("staffUser");
  await db.insert(staffUsers).values({
    id: staffId,
    email: `${TAG}@example.com`,
    name: "Sale Test",
    passwordHash: hashPassword("sale-test-pw-123"),
    role: "superadmin",
  });

  // Throwaway customer (org + workspace + live key) for the checkout-honesty check.
  const orgId = newId("organization");
  const wsId = newId("workspace");
  await db.insert(organizations).values({ id: orgId, name: "Sale Buyer", slug: TAG, plan: "free" });
  await db
    .insert(workspaces)
    .values({ id: wsId, organizationId: orgId, name: "Prod", slug: "production", environment: "live" });
  const key = generateApiKey("live");
  await db.insert(apiKeys).values({
    id: newId("apiKey"),
    workspaceId: wsId,
    name: "sale-test",
    prefix: key.prefix,
    last4: key.last4,
    keyHash: key.hash,
    mode: "live",
  });

  let saleCouponId: string | null = null;

  try {
    const login = await json(
      await fetch(`${API}/v1/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${TAG}@example.com`, password: "sale-test-pw-123" }),
      }),
    );
    const token = login.session_token as string | undefined;
    check(!!token, "staff login returns a token");
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Set a 25%-off sale ending in ~30 days.
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const set = await fetch(`${API}/v1/admin/plans/pro/sale`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ percent_off: 25, ends_at: endsAt }),
    });
    check(set.status === 200, `set sale → 200 (got ${set.status})`);
    const setBody = (await set.json()) as Record<string, unknown>;
    check(setBody.sale_percent_off === 25, "returns sale_percent_off = 25");
    if (stripeOn) check(setBody.stripe_sync === "synced", "Stripe coupon synced");

    // DB persisted + coupon created.
    const [pro] = await db.select().from(plans).where(eq(plans.id, "pro")).limit(1);
    check(pro?.salePercentOff === 25, "plan row stores salePercentOff");
    saleCouponId = pro?.saleStripeCouponId ?? null;
    if (stripeOn) {
      check(!!saleCouponId, "plan row stores the sale coupon id");
      const coupon = await stripe!.coupons.retrieve(saleCouponId!);
      check(coupon.percent_off === 25 && coupon.valid, "Stripe coupon is 25% off and valid");
    }

    // Cached resolver reports the sale.
    await refreshPlanCache();
    const sale = getSale("pro");
    check(!!sale && sale.percentOff === 25, "resolver getSale('pro') = 25% off");

    // Admin plan list surfaces it.
    const list = await json(await fetch(`${API}/v1/admin/plans`, { headers: H }));
    const proRow = (list.data as { id: string; sale_percent_off: number | null }[]).find((p) => p.id === "pro");
    check(proRow?.sale_percent_off === 25, "admin plan list shows the sale");

    // HONESTY: a customer checking out the on-sale plan actually gets the discount.
    if (stripeOn) {
      const co = await fetch(`${API}/v1/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval: "month" }),
      });
      const coBody = (await co.json()) as Record<string, unknown>;
      if (coBody.mode === "stripe" && typeof coBody.url === "string") {
        const m = coBody.url.match(/cs_(?:test|live)_[A-Za-z0-9]+/);
        if (m) {
          const session = await stripe!.checkout.sessions.retrieve(m[0]);
          const discount = session.total_details?.amount_discount ?? 0;
          check(discount > 0, `checkout applies the sale discount (amount_discount=${discount})`);
        } else {
          check(false, "could not parse the checkout session id from the URL");
        }
      } else {
        // No resolvable Stripe price for pro in this env — can't exercise checkout.
        console.log("SKIP — checkout honesty (no Stripe price for pro configured)");
      }
    }

    // Update the sale → coupon swapped.
    const upd = await fetch(`${API}/v1/admin/plans/pro/sale`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ percent_off: 30 }),
    });
    check(upd.status === 200, "update sale → 200");
    const [pro2] = await db.select().from(plans).where(eq(plans.id, "pro")).limit(1);
    check(pro2?.salePercentOff === 30, "sale updated to 30%");
    if (stripeOn && saleCouponId) {
      check(pro2?.saleStripeCouponId !== saleCouponId, "a new coupon was issued on update");
      const old = await stripe!.coupons.retrieve(saleCouponId).catch(() => null);
      check(old === null || old.valid === false, "the previous coupon was deleted");
      saleCouponId = pro2?.saleStripeCouponId ?? null;
    }

    // Clear the sale (no JSON body → don't send a Content-Type, like the real client).
    const clr = await fetch(`${API}/v1/admin/plans/pro/sale`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(clr.status === 200, "clear sale → 200");
    const [pro3] = await db.select().from(plans).where(eq(plans.id, "pro")).limit(1);
    check(pro3?.salePercentOff === null && pro3?.saleStripeCouponId === null, "sale fields cleared");
    await refreshPlanCache();
    const cleared = getSale("pro");
    check(!cleared || cleared.percentOff === 0, "resolver no longer reports a sale");
    if (stripeOn && saleCouponId) {
      const gone = await stripe!.coupons.retrieve(saleCouponId).catch(() => null);
      check(gone === null || gone.valid === false, "the sale coupon was deleted on clear");
    }

    // --- Add-on sale (charged via a discounted sale price) ---
    const aSet = await fetch(`${API}/v1/admin/addons/ai_credit_pack/sale`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ percent_off: 50 }),
    });
    check(aSet.status === 200, `set add-on sale → 200 (got ${aSet.status})`);
    const aBody = (await aSet.json()) as Record<string, unknown>;
    check(aBody.sale_percent_off === 50, "add-on returns sale_percent_off = 50");

    await refreshPlanCache();
    const aInfo = getAddon("ai_credit_pack");
    check(aInfo.salePercentOff === 50, "resolver sees the add-on sale");
    if (stripeOn) {
      check(!!aInfo.saleStripePriceId, "add-on sale price created");
      // priceForAddOn now bills the discounted sale price.
      check(
        priceForAddOn("ai_credit_pack") === aInfo.saleStripePriceId,
        "priceForAddOn returns the sale price while on sale",
      );
    }

    // Customer billing payload shows the discounted add-on price.
    const bill = await json(
      await fetch(`${API}/v1/billing`, { headers: { Authorization: `Bearer ${key.key}` } }),
    );
    const catalog = (bill.addons_catalog ?? []) as { id: string; sale_price: number | null }[];
    const aiPack = catalog.find((c) => c.id === "ai_credit_pack");
    check(aiPack?.sale_price === 2.5, `billing catalog shows add-on sale price $2.50 (got ${aiPack?.sale_price})`);

    // Clear the add-on sale.
    const aClr = await fetch(`${API}/v1/admin/addons/ai_credit_pack/sale`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(aClr.status === 200, `clear add-on sale → 200 (got ${aClr.status})`);
    await refreshPlanCache();
    check(getAddon("ai_credit_pack").salePercentOff === null, "add-on sale cleared");
    if (stripeOn) {
      check(
        priceForAddOn("ai_credit_pack") !== aInfo.saleStripePriceId,
        "priceForAddOn reverts to the regular price after clear",
      );
    }
  } finally {
    // Make sure the pro plan is never left on sale, then drop throwaway data.
    const [pro] = await db.select().from(plans).where(eq(plans.id, "pro")).limit(1);
    if (pro?.saleStripeCouponId && stripe) {
      await stripe.coupons.del(pro.saleStripeCouponId).catch(() => {});
    }
    await db
      .update(plans)
      .set({ salePercentOff: null, saleEndsAt: null, saleStripeCouponId: null })
      .where(eq(plans.id, "pro"));
    // Same for the add-on used in the sale checks.
    const [aiPack] = await db.select().from(addons).where(eq(addons.id, "ai_credit_pack")).limit(1);
    if (aiPack?.saleStripePriceId && stripe) {
      await stripe.prices.update(aiPack.saleStripePriceId, { active: false }).catch(() => {});
    }
    await db
      .update(addons)
      .set({ salePercentOff: null, saleEndsAt: null, saleStripePriceId: null })
      .where(eq(addons.id, "ai_credit_pack"));
    // Drop the throwaway customer (+ its Stripe customer if checkout created one).
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (org?.stripeCustomerId && stripe) await stripe.customers.del(org.stripeCustomerId).catch(() => {});
    await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades workspace + key
    await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
    await refreshPlanCache();
  }

  console.log(pass ? "\nAll pricing-sale checks passed." : "\nSome checks FAILED.");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
