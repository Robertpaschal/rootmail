/**
 * Stripe billing wiring check — TEST MODE ONLY.
 *   pnpm --filter @rootmail/api test:stripe
 *
 * Creates a throwaway test customer + subscription, then verifies add-on
 * subscription-item sync (add → update → remove), that the overage price
 * attaches, and that overage reporting no-ops safely until a meter is configured.
 * Cleans up everything it creates. No-op in local mode (no Stripe key).
 */
import { and, eq } from "drizzle-orm";
import { newId, PLANS } from "@rootmail/core";
import {
  closeDb,
  db,
  type Organization,
  orgAddons,
  organizations,
  usageRecords,
} from "@rootmail/db";
import { currentPeriod } from "../src/lib/billing";
import {
  getStripe,
  overageMeterEvent,
  overagePriceForPlan,
  priceForAddOn,
  priceForPlan,
  reportOverage,
  syncAddonItems,
} from "../src/lib/stripe";

async function main(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) {
    console.log("Stripe not configured (local mode) — skipping.");
    await closeDb();
    return;
  }

  const planPrice = priceForPlan("pro");
  const seatPrice = priceForAddOn("extra_seat");
  const overagePrice = overagePriceForPlan("pro");
  console.log("price ids present:", {
    plan: Boolean(planPrice),
    seat: Boolean(seatPrice),
    overage: Boolean(overagePrice),
    overage_meter: Boolean(overageMeterEvent("pro")),
  });
  if (!planPrice || !seatPrice) {
    console.error("FAIL — STRIPE_PRICE_PRO and STRIPE_PRICE_SEAT must be set.");
    process.exit(1);
  }

  let pass = true; // tracks OUR wiring; config gaps are reported separately
  const configNotes: string[] = [];
  let customerId: string | undefined;
  let subId: string | undefined;
  let orgId: string | undefined;

  try {
    const customer = await stripe.customers.create({ name: "rootmail-billing-test" });
    customerId = customer.id;
    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const items: { price: string }[] = [{ price: planPrice }];
    if (overagePrice) items.push({ price: overagePrice });
    let sub: { id: string; status: string };
    try {
      sub = await stripe.subscriptions.create({ customer: customer.id, items });
      console.log(`✓ subscription created (plan${overagePrice ? " + overage meter" : ""}) — ${sub.status}`);
    } catch (err) {
      console.log(`⚠ overage price not attachable: ${String(err)}`);
      configNotes.push(
        "Overage prices must be RECURRING usage-based (metered) prices backed by a " +
          "Billing Meter — recreate STRIPE_PRICE_OVERAGE_PRO/_SCALE accordingly.",
      );
      sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: planPrice }] });
    }
    subId = sub.id;

    orgId = newId("organization");
    await db.insert(organizations).values({
      id: orgId,
      name: "billing-test",
      slug: `billing-test-${orgId.slice(-6)}`,
      plan: "pro",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: sub.id,
    });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

    const seatQty = async () => {
      const s = await stripe.subscriptions.retrieve(sub.id);
      return s.items.data.find((i) => i.price.id === seatPrice)?.quantity;
    };

    // Add seat ×2.
    await db
      .insert(orgAddons)
      .values({ id: newId("orgAddon"), organizationId: orgId, addonId: "extra_seat", quantity: 2 });
    await syncAddonItems(org as Organization);
    const q1 = await seatQty();
    console.log(`${q1 === 2 ? "✓" : "✗"} add-on item added (seat ×2) → qty=${q1}`);
    pass &&= q1 === 2;

    // Update to ×5.
    await db.update(orgAddons).set({ quantity: 5 }).where(eq(orgAddons.organizationId, orgId));
    await syncAddonItems(org as Organization);
    const q2 = await seatQty();
    console.log(`${q2 === 5 ? "✓" : "✗"} add-on qty updated (seat ×5) → qty=${q2}`);
    pass &&= q2 === 5;

    // Remove (×0).
    await db.update(orgAddons).set({ quantity: 0 }).where(eq(orgAddons.organizationId, orgId));
    await syncAddonItems(org as Organization);
    const q3 = await seatQty();
    console.log(`${q3 === undefined ? "✓" : "✗"} add-on item removed (seat ×0) → present=${q3 !== undefined}`);
    pass &&= q3 === undefined;

    // Overage reporting. If the meter is configured, drive real usage over the
    // quota and confirm a meter event is sent + the delta is persisted; otherwise
    // confirm it no-ops cleanly.
    const period = currentPeriod();
    if (overageMeterEvent("pro")) {
      const over = PLANS.pro.monthlyQuota + 5_000; // → 5 units (1 unit = 1,000)
      await db
        .insert(usageRecords)
        .values({ id: newId("usage"), organizationId: orgId, period, emailsSent: over })
        .onConflictDoUpdate({
          target: [usageRecords.organizationId, usageRecords.period],
          set: { emailsSent: over },
        });
      try {
        await reportOverage(org as Organization);
        const [u] = await db
          .select({ reported: usageRecords.overageReportedUnits })
          .from(usageRecords)
          .where(and(eq(usageRecords.organizationId, orgId), eq(usageRecords.period, period)))
          .limit(1);
        const ok = u?.reported === 5;
        console.log(`${ok ? "✓" : "✗"} overage reported to meter → ${u?.reported} units persisted (expect 5)`);
        pass &&= ok;
        // Idempotent: a second call with no new usage must not re-report.
        await reportOverage(org as Organization);
        const [u2] = await db
          .select({ reported: usageRecords.overageReportedUnits })
          .from(usageRecords)
          .where(and(eq(usageRecords.organizationId, orgId), eq(usageRecords.period, period)))
          .limit(1);
        const ok2 = u2?.reported === 5;
        console.log(`${ok2 ? "✓" : "✗"} re-report is a no-op (still ${u2?.reported}, no double-count)`);
        pass &&= ok2;
      } catch (err) {
        console.log(`✗ reportOverage threw: ${String(err)}`);
        pass = false;
      }
    } else {
      await reportOverage(org as Organization);
      console.log("✓ reportOverage no-op (meter not configured)");
    }
  } finally {
    if (subId) await stripe.subscriptions.cancel(subId).catch(() => {});
    if (customerId) await stripe.customers.del(customerId).catch(() => {});
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => {});
  }

  if (!overageMeterEvent("pro") || !overageMeterEvent("scale")) {
    configNotes.push(
      "Set STRIPE_METER_OVERAGE_PRO / STRIPE_METER_OVERAGE_SCALE to each overage " +
        "price's Billing Meter event_name to turn on overage usage reporting.",
    );
  }

  console.log(pass ? "\nPASS — our Stripe wiring is correct (add-ons verified live)" : "\nFAIL — see above");
  if (configNotes.length) {
    console.log("\nConfig still needed in Stripe to activate overage billing:");
    for (const n of configNotes) console.log(`  • ${n}`);
  }
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
