import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  ADD_ON_IDS,
  ADD_ONS,
  type AddOnId,
  type BillingInterval,
  BILLING_MODE,
  env,
  type PlanId,
  type PlanStatus,
} from "@rootmail/core";
import { db, type Organization, orgAddons, organizations, type Plan, plans } from "@rootmail/db";
import { getReportedOverage, getUsage, setReportedOverage } from "./billing";
import { getPlan, getStripePrices } from "./plans";

// ---------------------------------------------------------------------------
// Stripe billing abstraction.
//
// The whole module is fail-soft: when STRIPE_SECRET_KEY is unset (local mode)
// every entry point degrades to a no-op or a "local" result so the caller can
// fall back to the PLANS/ADD_ONS default constants. The app is therefore always
// functional — Stripe being absent, misconfigured, or briefly unreachable never
// blocks a plan change; it just routes through the local self-serve switch.
// ---------------------------------------------------------------------------

let _stripe: Stripe | null | undefined;

/** Lazy singleton Stripe client; null when not configured (local mode). */
export function getStripe(): Stripe | null {
  if (_stripe === undefined) {
    _stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
  }
  return _stripe;
}

export function stripeEnabled(): boolean {
  return BILLING_MODE === "stripe" && getStripe() !== null;
}

/** Env-configured Stripe price id for a plan/interval (the original setup). */
function envPriceForPlan(planId: PlanId, interval: BillingInterval): string | null {
  if (planId === "pro") return (interval === "year" ? env.STRIPE_PRICE_PRO_YEAR : env.STRIPE_PRICE_PRO) ?? null;
  if (planId === "scale") return (interval === "year" ? env.STRIPE_PRICE_SCALE_YEAR : env.STRIPE_PRICE_SCALE) ?? null;
  return null; // free = cancel; enterprise = sales-assisted (no self-serve price)
}

/**
 * Stripe price id for a plan/interval. Prefers the admin-synced DB price (set by
 * `syncPlanPrice`), falling back to the env price before any sync has happened.
 */
export function priceForPlan(planId: PlanId, interval: BillingInterval = "month"): string | null {
  const synced = getStripePrices(planId);
  const syncedId = synced ? (interval === "year" ? synced.year : synced.month) : null;
  return syncedId ?? envPriceForPlan(planId, interval);
}

/** Configured Stripe price id for an add-on, or null (→ use default constant). */
export function priceForAddOn(id: AddOnId): string | null {
  const val = env[ADD_ONS[id].priceEnvKey as keyof typeof env];
  return typeof val === "string" && val ? val : null;
}

/**
 * Configured METERED Stripe price id for a plan's overage, or null. The price
 * must be a metered recurring price billed per UNIT, where 1 unit = 1,000 emails
 * (Pro $0.85/unit, Scale $0.70/unit) — we report `ceil(overage / 1000)` units.
 */
export function overagePriceForPlan(planId: PlanId): string | null {
  if (planId === "pro") return env.STRIPE_PRICE_OVERAGE_PRO ?? null;
  if (planId === "scale") return env.STRIPE_PRICE_OVERAGE_SCALE ?? null;
  return null; // free has no overage; enterprise is custom-billed
}

/** Billing Meter `event_name` used to report overage usage for a plan, or null. */
export function overageMeterEvent(planId: PlanId): string | null {
  if (planId === "pro") return env.STRIPE_METER_OVERAGE_PRO ?? null;
  if (planId === "scale") return env.STRIPE_METER_OVERAGE_SCALE ?? null;
  return null;
}

/** The set of all configured add-on Stripe price ids (to tell them apart from
 * the plan + overage items on a subscription). */
function addOnPriceIds(): Set<string> {
  return new Set(ADD_ON_IDS.map((id) => priceForAddOn(id)).filter((p): p is string => Boolean(p)));
}

/** Current add-on quantities for an org (only those with quantity > 0). */
async function loadAddonQuantities(orgId: string): Promise<{ id: AddOnId; quantity: number }[]> {
  const rows = await db
    .select({ addonId: orgAddons.addonId, quantity: orgAddons.quantity })
    .from(orgAddons)
    .where(eq(orgAddons.organizationId, orgId));
  return rows
    .filter((r) => r.quantity > 0)
    .map((r) => ({ id: r.addonId as AddOnId, quantity: r.quantity }));
}

/** Reverse lookup: which plan does a Stripe price id correspond to? */
function planForPrice(priceId: string): PlanId | null {
  if (priceId === env.STRIPE_PRICE_PRO || priceId === env.STRIPE_PRICE_PRO_YEAR) return "pro";
  if (priceId === env.STRIPE_PRICE_SCALE || priceId === env.STRIPE_PRICE_SCALE_YEAR) return "scale";
  return null;
}

/** Collapse Stripe's subscription statuses onto our coarser PlanStatus. */
function toPlanStatus(s: Stripe.Subscription.Status): PlanStatus {
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled") return s;
  return "incomplete";
}

/** Ensure the org has a Stripe customer; create + persist it on first need. */
export async function ensureCustomer(org: Organization): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: org.name,
    metadata: { organizationId: org.id },
  });
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export interface CheckoutResult {
  /** "stripe" → redirect the user to `url`; "local" → apply the change directly. */
  mode: "stripe" | "local";
  url?: string;
}

/**
 * Start a plan change. In Stripe mode with a resolvable price this returns a
 * hosted Checkout URL; otherwise (local mode, or a missing/unloadable price) it
 * returns `{ mode: "local" }` so the caller applies the change from the PLANS
 * defaults — Stripe being unavailable never blocks the upgrade.
 */
export async function createCheckout(
  org: Organization,
  planId: PlanId,
  interval: BillingInterval = "month",
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const price = priceForPlan(planId, interval);
  if (!stripe || !price) return { mode: "local" };

  try {
    const customer = await ensureCustomer(org);
    const base = env.DASHBOARD_URL.replace(/\/$/, "");

    // Build the full subscription: base plan + any add-ons (as quantity items) +
    // the metered overage item (no quantity — usage is reported against it).
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price, quantity: 1 }];
    for (const a of await loadAddonQuantities(org.id)) {
      const addonPrice = priceForAddOn(a.id);
      if (addonPrice) lineItems.push({ price: addonPrice, quantity: a.quantity });
    }
    // Only attach overage once it's FULLY configured (price + meter), so a
    // half-set-up (e.g. one-time) overage price can't break subscription checkout.
    const overagePrice = overagePriceForPlan(planId);
    if (overagePrice && overageMeterEvent(planId)) lineItems.push({ price: overagePrice });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: lineItems,
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancel`,
      metadata: { organizationId: org.id, planId, interval },
      subscription_data: { metadata: { organizationId: org.id, planId, interval } },
      allow_promotion_codes: true,
    });
    if (session.url) return { mode: "stripe", url: session.url };
  } catch (err) {
    // Stripe hiccup mid-setup — don't block the user; fall back to local.
    console.warn(`[stripe] checkout failed, falling back to local: ${String(err)}`);
  }
  return { mode: "local" };
}

/**
 * Sync an org's plan/status from a Stripe subscription (webhook-driven). Looks
 * the org up by customer id, then by the subscription metadata as a fallback.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId))
    .limit(1);
  if (!org && sub.metadata?.organizationId) {
    [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, sub.metadata.organizationId))
      .limit(1);
  }
  if (!org) return;

  let planId: PlanId | null = null;
  for (const item of sub.items.data) {
    const match = item.price?.id ? planForPrice(item.price.id) : null;
    if (match) {
      planId = match;
      break;
    }
  }

  const status = toPlanStatus(sub.status);
  // A canceled/ended subscription drops the org back to Free.
  const nextPlan: PlanId = status === "canceled" ? "free" : (planId ?? org.plan);

  await db
    .update(organizations)
    .set({
      plan: nextPlan,
      planStatus: status,
      stripeSubscriptionId: sub.id,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));
}

/**
 * Reconcile an org's add-on subscription items with its `org_addons` rows —
 * add, change the quantity of, or remove add-on items so Stripe matches the DB.
 * No-op without a Stripe subscription (a free org has none → upgrade first).
 */
export async function syncAddonItems(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !org.stripeSubscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  const addonPrices = addOnPriceIds();
  const want = new Map<string, number>();
  for (const a of await loadAddonQuantities(org.id)) {
    const price = priceForAddOn(a.id);
    if (price) want.set(price, a.quantity);
  }

  for (const item of sub.items.data) {
    const priceId = item.price.id;
    if (!addonPrices.has(priceId)) continue; // leave the plan + overage items alone
    const qty = want.get(priceId);
    if (qty && qty > 0) {
      if (item.quantity !== qty) await stripe.subscriptionItems.update(item.id, { quantity: qty });
      want.delete(priceId);
    } else {
      await stripe.subscriptionItems.del(item.id);
    }
  }
  for (const [priceId, qty] of want) {
    if (qty > 0) {
      await stripe.subscriptionItems.create({ subscription: sub.id, price: priceId, quantity: qty });
    }
  }
}

/**
 * Report this month's overage to Stripe's Billing Meter (1 unit = 1,000 emails).
 * Meters aggregate events by sum, so we report only the DELTA since the last
 * report and persist the running total. No-op until the plan's meter `event_name`
 * is configured (STRIPE_METER_OVERAGE_*). Safe to call lazily (bill view) and/or
 * from a period-end job.
 */
export async function reportOverage(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) return;
  const eventName = overageMeterEvent(org.plan);
  if (!eventName) return; // meter not configured yet → nothing to report

  const used = await getUsage(org.id);
  const quota = getPlan(org.plan).monthlyQuota;
  const units = Math.max(0, Math.ceil((used - quota) / 1000));
  const alreadyReported = await getReportedOverage(org.id);
  const delta = units - alreadyReported;
  if (delta <= 0) return; // nothing new this period

  await stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: { value: String(delta), stripe_customer_id: org.stripeCustomerId },
  });
  await setReportedOverage(org.id, units);
}

/**
 * Sync a plan's billed price to Stripe after an admin edit. Stripe prices are
 * immutable, so we create NEW monthly + yearly prices (yearly = 10× monthly, "2
 * months free") on the plan's product, make the monthly the product default,
 * archive the previously-synced prices (existing subscriptions are grandfathered
 * — archived prices keep billing current subs, they just can't start new ones),
 * and persist the new ids. No-op for plans without a self-serve price (free $0 /
 * enterprise custom) or when Stripe is unconfigured.
 */
export async function syncPlanPrice(plan: Plan): Promise<{ month: string; year: string } | null> {
  const stripe = getStripe();
  if (!stripe || plan.price == null || plan.price <= 0) return null;

  // Find the plan's Stripe product — reuse the one behind an existing price, else
  // create a product for this plan.
  const existing = plan.stripePriceMonthId ?? envPriceForPlan(plan.id, "month");
  let productId: string;
  if (existing) {
    const ep = await stripe.prices.retrieve(existing);
    productId = typeof ep.product === "string" ? ep.product : ep.product.id;
  } else {
    const product = await stripe.products.create({
      name: `rootmail ${plan.name}`,
      metadata: { planId: plan.id },
    });
    productId = product.id;
  }

  const month = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: plan.price * 100,
    recurring: { interval: "month" },
    metadata: { planId: plan.id, interval: "month" },
  });
  const year = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: plan.price * 10 * 100, // 2 months free
    recurring: { interval: "year" },
    metadata: { planId: plan.id, interval: "year" },
  });
  await stripe.products.update(productId, { default_price: month.id });

  // Grandfather: archive only previously-synced prices (leave the original env
  // price active for any subs still on it).
  if (plan.stripePriceMonthId) {
    await stripe.prices.update(plan.stripePriceMonthId, { active: false }).catch(() => {});
  }
  if (plan.stripePriceYearId) {
    await stripe.prices.update(plan.stripePriceYearId, { active: false }).catch(() => {});
  }

  await db
    .update(plans)
    .set({ stripePriceMonthId: month.id, stripePriceYearId: year.id, updatedAt: new Date() })
    .where(eq(plans.id, plan.id));

  return { month: month.id, year: year.id };
}
