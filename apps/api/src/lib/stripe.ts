import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  ADD_ON_IDS,
  ADD_ONS,
  type AddOnId,
  type BillingInterval,
  BILLING_MODE,
  env,
  newId,
  type PlanId,
  type PlanStatus,
  saleActive,
} from "@rootmail/core";
import {
  type Addon,
  addons as addonsTable,
  type CustomPlan,
  customPlans,
  db,
  memberships,
  type Organization,
  orgAddons,
  organizations,
  type Plan,
  plans,
  type PricingTier,
  pricingTiers,
  users,
} from "@rootmail/db";
import { getReportedOverage, getUsage, setReportedOverage } from "./billing";
import { getAddon, getSale, getStripePrices, getTrialDays, planForOrg } from "./plans";

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

/** Env-configured Stripe price id for an add-on at the given interval, or null. The
 * yearly key is the monthly key + "_YEAR" (e.g. STRIPE_PRICE_ADDON_WORKSPACE_PACK_YEAR). */
function envAddOnPriceId(id: AddOnId, interval: BillingInterval = "month"): string | null {
  const base = ADD_ONS[id].priceEnvKey;
  const val = env[(interval === "year" ? `${base}_YEAR` : base) as keyof typeof env];
  return typeof val === "string" && val ? val : null;
}

/** The NON-sale (regular) Stripe price id for an add-on. Monthly prefers the admin-synced
 * DB price (synced → env); yearly uses the env _YEAR price (admin sync is monthly-only). */
function regularAddOnPriceId(id: AddOnId, interval: BillingInterval = "month"): string | null {
  if (interval === "year") return envAddOnPriceId(id, "year");
  return getAddon(id).stripePriceId ?? envAddOnPriceId(id, "month");
}

/**
 * Effective Stripe price id for an add-on at the given interval — the discounted sale
 * price while a sale is active (monthly only), otherwise the regular price. Both checkout
 * and add-on sync bill through this, so an add-on on sale is charged at its sale price
 * everywhere (no coupon stacking with a plan sale).
 */
export function priceForAddOn(id: AddOnId, interval: BillingInterval = "month"): string | null {
  const a = getAddon(id);
  if (
    interval === "month" &&
    a.saleStripePriceId &&
    saleActive({ percentOff: a.salePercentOff ?? 0, endsAt: a.saleEndsAt })
  ) {
    return a.saleStripePriceId;
  }
  return regularAddOnPriceId(id, interval);
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

/** All add-on Stripe price ids — regular AND sale — so add-on items on a sub are
 * recognized (and reconciled) no matter which price they currently sit on. */
function addOnPriceIds(): Set<string> {
  const ids = new Set<string>();
  for (const id of ADD_ON_IDS) {
    for (const itv of ["month", "year"] as const) {
      const reg = regularAddOnPriceId(id, itv);
      if (reg) ids.add(reg);
    }
    const sale = getAddon(id).saleStripePriceId;
    if (sale) ids.add(sale);
  }
  return ids;
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

/** Reverse lookup: which add-on (if any) does a Stripe price id correspond to? Matches
 * the regular OR the sale price id, so add-on items are recognized on either. */
function addOnForPrice(priceId: string): AddOnId | null {
  for (const id of ADD_ON_IDS) {
    if (regularAddOnPriceId(id, "month") === priceId) return id;
    if (regularAddOnPriceId(id, "year") === priceId) return id;
    if (getAddon(id).saleStripePriceId === priceId) return id;
  }
  return null;
}

/**
 * Make an org's `org_addons` entitlements exactly match what a subscription bills —
 * the source of truth after a "configure at checkout" purchase (where add-ons are
 * chosen on the checkout page, not via /v1/billing/addons). Every catalog add-on is
 * set to its billed quantity (0 when absent / on a canceled sub).
 */
export async function reconcileAddonsFromSubscription(
  orgId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const billed = new Map<AddOnId, number>();
  for (const item of sub.items.data) {
    const id = item.price?.id ? addOnForPrice(item.price.id) : null;
    if (id) billed.set(id, (billed.get(id) ?? 0) + (item.quantity ?? 0));
  }
  for (const id of ADD_ON_IDS) {
    const qty = sub.status === "canceled" ? 0 : (billed.get(id) ?? 0);
    await db
      .insert(orgAddons)
      .values({ id: newId("orgAddon"), organizationId: orgId, addonId: id, quantity: qty })
      .onConflictDoUpdate({
        target: [orgAddons.organizationId, orgAddons.addonId],
        set: { quantity: qty, updatedAt: new Date() },
      });
    if (id === "dedicated_ip") await syncDedicatedIpProvisioning(orgId, qty);
  }
}

/**
 * A dedicated IP is real infra (an SES dedicated IP / pool) that staff provision.
 * So buying the add-on flags the org for provisioning rather than pretending it's
 * instant: none → requested on purchase; requested → none if canceled before it was
 * ever provisioned; an `active` IP is left for staff to tear down deliberately.
 */
export async function syncDedicatedIpProvisioning(orgId: string, qty: number): Promise<void> {
  const [org] = await db
    .select({ status: organizations.dedicatedIpStatus })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;
  if (qty > 0 && org.status === "none") {
    await db
      .update(organizations)
      .set({ dedicatedIpStatus: "requested", updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  } else if (qty === 0 && org.status === "requested") {
    await db
      .update(organizations)
      .set({ dedicatedIpStatus: "none", updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
  }
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

/** The org owner's contact (email + name) for a Stripe customer, or null — used to
 * address billing lifecycle emails (payment failed, trial ending). */
export async function ownerContactForCustomer(
  customerId: string,
): Promise<{ email: string; name: string | null } | null> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId))
    .limit(1);
  if (!org) return null;
  const [row] = await db
    .select({ email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, org.id), eq(memberships.role, "owner")))
    .limit(1);
  return row ?? null;
}

export interface CheckoutResult {
  /** "stripe" → redirect the user to `url`; "local" → apply the change directly. */
  mode: "stripe" | "local";
  url?: string;
}

/** Plan + add-ons (as quantity items) + the metered overage item — the full set of
 * subscription line items shared by hosted and embedded checkout. `addonQtys`, when
 * given, overrides the org's current add-ons (the "configure at checkout" flow);
 * otherwise the org's existing add-ons are carried over. */
async function buildCheckoutLineItems(
  org: Organization,
  planId: PlanId,
  price: string,
  interval: BillingInterval,
  addonQtys?: Record<string, number>,
): Promise<Stripe.Checkout.SessionCreateParams.LineItem[]> {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price, quantity: 1 }];
  const selected = addonQtys
    ? ADD_ON_IDS.filter((id) => (addonQtys[id] ?? 0) > 0).map((id) => ({ id, quantity: addonQtys[id] }))
    : await loadAddonQuantities(org.id);
  for (const a of selected) {
    // Add-ons bill at the same interval as the plan (yearly sub → yearly add-on price).
    const addonPrice = priceForAddOn(a.id, interval);
    if (addonPrice) lineItems.push({ price: addonPrice, quantity: a.quantity });
  }
  // Metered overage is a MONTHLY price; Stripe forbids mixing billing intervals in one
  // subscription, so it only attaches to monthly checkout (a yearly plan would need a
  // yearly metered overage price). Only attach once fully configured (price + meter).
  const overagePrice = overagePriceForPlan(planId);
  if (interval === "month" && overagePrice && overageMeterEvent(planId)) {
    lineItems.push({ price: overagePrice });
  }
  return lineItems;
}

/** On sale → auto-apply the sale coupon (so the charge matches the marketed price);
 * otherwise allow a manual promo code. Stripe forbids both at once. */
function checkoutDiscountParams(
  planId: PlanId,
): { discounts: Array<{ coupon: string }> } | { allow_promotion_codes: true } {
  const sale = getSale(planId);
  if (sale?.couponId && saleActive({ percentOff: sale.percentOff, endsAt: sale.endsAt })) {
    return { discounts: [{ coupon: sale.couponId }] };
  }
  return { allow_promotion_codes: true };
}

/**
 * Start a plan change via HOSTED Stripe Checkout. Returns a redirect URL in Stripe
 * mode with a resolvable price; otherwise `{ mode: "local" }` so the caller applies
 * the change from the PLANS defaults — Stripe being unavailable never blocks it.
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
    const lineItems = await buildCheckoutLineItems(org, planId, price, interval);
    const trialDays = getTrialDays(planId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: lineItems,
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancel`,
      metadata: { organizationId: org.id, planId, interval },
      subscription_data: {
        metadata: { organizationId: org.id, planId, interval },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      ...checkoutDiscountParams(planId),
    });
    if (session.url) return { mode: "stripe", url: session.url };
  } catch (err) {
    // Stripe hiccup mid-setup — don't block the user; fall back to local.
    console.warn(`[stripe] checkout failed, falling back to local: ${String(err)}`);
  }
  return { mode: "local" };
}

export interface EmbeddedCheckoutResult {
  mode: "embedded" | "unavailable";
  client_secret?: string;
  publishable_key?: string;
}

/**
 * Start a plan change via ON-PAGE (embedded) Stripe Checkout: returns a session
 * client_secret + the publishable key for the dashboard to mount inline (no
 * redirect). Same subscription / add-ons / overage / trial + sale-or-promo logic
 * as the hosted flow. Returns `{ mode: "unavailable" }` when Stripe, the price, or
 * the publishable key isn't configured — the caller then falls back to the hosted
 * redirect (or local), so checkout always works.
 */
export async function createEmbeddedCheckout(
  org: Organization,
  planId: PlanId,
  interval: BillingInterval = "month",
  addonQtys?: Record<string, number>,
): Promise<EmbeddedCheckoutResult> {
  const stripe = getStripe();
  const price = priceForPlan(planId, interval);
  const pk = env.STRIPE_PUBLISHABLE_KEY;
  if (!stripe || !price || !pk) return { mode: "unavailable" };

  try {
    const customer = await ensureCustomer(org);
    const base = env.DASHBOARD_URL.replace(/\/$/, "");
    const lineItems = await buildCheckoutLineItems(org, planId, price, interval, addonQtys);
    const trialDays = getTrialDays(planId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // This SDK pins a Stripe API version whose embedded UI mode is "embedded_page"
      // (the stable alias is "embedded"); @stripe/react-stripe-js consumes the
      // resulting client_secret either way.
      ui_mode: "embedded_page",
      customer,
      line_items: lineItems,
      // Embedded sessions return here in-page after completion; the webhook is what
      // actually flips the plan (return is just UX).
      return_url: `${base}/billing?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
      metadata: { organizationId: org.id, planId, interval },
      subscription_data: {
        metadata: { organizationId: org.id, planId, interval },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      ...checkoutDiscountParams(planId),
    });
    if (session.client_secret) {
      return { mode: "embedded", client_secret: session.client_secret, publishable_key: pk };
    }
  } catch (err) {
    console.warn(`[stripe] embedded checkout failed: ${String(err)}`);
  }
  return { mode: "unavailable" };
}

/**
 * Sync an org's plan/status from a Stripe subscription (webhook-driven). Looks
 * the org up by customer id, then by the subscription metadata as a fallback.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  // Custom/enterprise subscriptions (send-invoice, created by provisionCustomSubscription)
  // are administered through the admin custom-plan endpoints, which set the org's plan,
  // status, and subscription id directly. Their webhook events must NOT drive the
  // self-serve resolver — in particular, canceling one (via deactivate or in the Stripe
  // dashboard) must not silently downgrade the org to Free or re-attach the dead sub.
  if (sub.metadata?.custom === "true") return;
  // The dedicated monthly overage sub (for yearly plans) is bookkeeping, not the plan
  // subscription — its events must not overwrite the org's plan/subscription id or add-ons.
  if (sub.metadata?.kind === "overage") return;

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
  let interval: BillingInterval = org.billingInterval;
  for (const item of sub.items.data) {
    const match = item.price?.id ? planForPrice(item.price.id) : null;
    if (match) {
      planId = match;
      // Track the billed interval from the plan price so the dashboard, add-on
      // reconciliation, and overage billing all agree with what Stripe is charging.
      if (item.price.recurring?.interval === "year") interval = "year";
      else if (item.price.recurring?.interval === "month") interval = "month";
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
      billingInterval: interval,
      stripeSubscriptionId: sub.id,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  // Keep entitlements honest: match org_addons to what the subscription actually
  // bills (covers add-ons chosen on the checkout page).
  await reconcileAddonsFromSubscription(org.id, sub);

  // A Stripe-side cancel or downgrade can strip a yearly org's overage eligibility —
  // bring the dedicated overage sub in line. Re-fetch so we see the writes just above.
  const [fresh] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  if (fresh) await reconcileOverageSubscription(fresh);
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
    const price = priceForAddOn(a.id, org.billingInterval);
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

  // Yearly plans bill overage on a separate monthly sub; make sure it exists before
  // we report usage (no-op for monthly, or once the sub already exists).
  await reconcileOverageSubscription(org);

  const used = await getUsage(org.id);
  const quota = planForOrg(org).monthlyQuota;
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
 * Keep an org's overage billing in sync with its plan interval.
 *
 * Overage is an inherently MONTHLY charge, but Stripe forbids mixing billing
 * intervals in one subscription — so a YEARLY plan can't carry the metered overage
 * item on its annual base subscription. Instead we bill overage on a SEPARATE
 * monthly metered subscription. The per-customer meter events (`reportOverage`) then
 * bill on whichever subscription holds the metered price: the plan sub for monthly
 * orgs, this dedicated sub for yearly orgs.
 *
 * This reconciles reality to the org's state — a yearly org on a metered plan gets
 * the dedicated overage sub (created once, $0 until usage accrues); anything else
 * (monthly, free, enterprise, Stripe off) has it cancelled. Idempotent and safe to
 * call from both the webhook (plan changes) and `reportOverage` (lazy first use).
 */
export async function reconcileOverageSubscription(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) return;

  const overagePrice = overagePriceForPlan(org.plan);
  const shouldHave =
    org.billingInterval === "year" && overagePrice != null && overageMeterEvent(org.plan) != null;

  if (shouldHave && !org.stripeOverageSubscriptionId) {
    try {
      // Metered price, no quantity. The idempotency key collapses the races from
      // concurrent sends (each fires reportOverage → reconcile) into one sub.
      const sub = await stripe.subscriptions.create(
        {
          customer: org.stripeCustomerId,
          items: [{ price: overagePrice! }],
          metadata: { organization_id: org.id, kind: "overage", plan: org.plan },
        },
        { idempotencyKey: `overage-sub-${org.id}` },
      );
      await db
        .update(organizations)
        .set({ stripeOverageSubscriptionId: sub.id })
        .where(eq(organizations.id, org.id));
    } catch (err) {
      console.warn(`[stripe] overage subscription create failed for ${org.id}: ${String(err)}`);
    }
  } else if (!shouldHave && org.stripeOverageSubscriptionId) {
    // Left yearly / lost overage → stop the dedicated sub (overage moves back onto the
    // monthly plan sub, or away entirely). Clearing the id is safe even if the cancel
    // 404s (already gone).
    await stripe.subscriptions
      .cancel(org.stripeOverageSubscriptionId)
      .catch((err) => console.warn(`[stripe] overage sub cancel failed for ${org.id}: ${String(err)}`));
    await db
      .update(organizations)
      .set({ stripeOverageSubscriptionId: null })
      .where(eq(organizations.id, org.id));
  }
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

/**
 * Provision a per-wing TIER's Stripe price (PRICING-WINGS-SPEC.md, Phase D) — the
 * same immutable-price dance as `syncPlanPrice`, but for `pricing_tiers`: one Stripe
 * product per tier (metadata tierId + wing) with monthly + yearly recurring prices,
 * persisted on the row so checkout + the webhook can resolve them. No-op for free /
 * custom tiers (price 0 / null) or without Stripe. Each price's metadata carries
 * `wing` so the webhook knows which org column to set.
 */
export async function syncTierPrice(tier: PricingTier): Promise<{ month: string; year: string } | null> {
  const stripe = getStripe();
  if (!stripe || tier.priceMonthly == null || tier.priceMonthly <= 0) return null;

  const existing = tier.stripePriceMonthId;
  let productId: string;
  if (existing) {
    const ep = await stripe.prices.retrieve(existing);
    productId = typeof ep.product === "string" ? ep.product : ep.product.id;
  } else {
    const product = await stripe.products.create({
      name: `rootmail ${tier.name} · ${tier.wing}`,
      metadata: { tierId: tier.id, wing: tier.wing },
    });
    productId = product.id;
  }

  const month = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: tier.priceMonthly * 100,
    recurring: { interval: "month" },
    metadata: { tierId: tier.id, wing: tier.wing, interval: "month" },
  });
  const year = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: (tier.priceYearly ?? tier.priceMonthly * 10) * 100, // yearly, else 2 months free
    recurring: { interval: "year" },
    metadata: { tierId: tier.id, wing: tier.wing, interval: "year" },
  });
  await stripe.products.update(productId, { default_price: month.id });

  // Grandfather: archive only the previously-synced prices (current subs keep billing).
  if (tier.stripePriceMonthId) await stripe.prices.update(tier.stripePriceMonthId, { active: false }).catch(() => {});
  if (tier.stripePriceYearId) await stripe.prices.update(tier.stripePriceYearId, { active: false }).catch(() => {});

  await db
    .update(pricingTiers)
    .set({ stripePriceMonthId: month.id, stripePriceYearId: year.id, updatedAt: new Date() })
    .where(eq(pricingTiers.id, tier.id));

  return { month: month.id, year: year.id };
}

/** Provision Stripe prices for every paid wing tier — run once after seeding
 * `pricing_tiers` (idempotent-safe: re-running mints fresh prices + archives the old,
 * exactly like an admin plan-price edit). Returns how many tiers were synced. */
export async function syncAllTierPrices(): Promise<{ synced: number }> {
  const stripe = getStripe();
  if (!stripe) return { synced: 0 };
  const rows = await db.select().from(pricingTiers);
  let synced = 0;
  for (const t of rows) {
    if (t.priceMonthly != null && t.priceMonthly > 0) {
      await syncTierPrice(t);
      synced++;
    }
  }
  return { synced };
}

/**
 * Sync an add-on's price to Stripe after an admin edit — same immutable-price
 * dance as plans: create a new recurring price on the add-on's product, make it
 * the default, archive the prior synced price, persist the id. No-op without
 * Stripe or a positive price.
 */
/**
 * Create the auto-applied coupon behind a plan sale (percent off, redeemable until
 * `endsAt`). `duration: forever` locks the discount in for anyone who subscribes
 * during the sale — so the struck-through price they saw is the price they keep.
 * Deletes the prior sale coupon so they don't accumulate. Returns the coupon id,
 * or null without Stripe (the sale still shows + the % is enforced via the price).
 */
export async function syncPlanSaleCoupon(
  plan: Plan,
  percentOff: number,
  endsAt: Date | null,
): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  if (plan.saleStripeCouponId) {
    await stripe.coupons.del(plan.saleStripeCouponId).catch(() => {});
  }
  const coupon = await stripe.coupons.create({
    name: `${plan.name} — ${percentOff}% off`,
    percent_off: percentOff,
    duration: "forever",
    ...(endsAt ? { redeem_by: Math.floor(endsAt.getTime() / 1000) } : {}),
    metadata: { planId: plan.id, kind: "plan_sale" },
  });
  return coupon.id;
}

/** Remove a plan's sale coupon in Stripe (when an admin clears the sale). */
export async function deletePlanSaleCoupon(plan: Plan): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !plan.saleStripeCouponId) return;
  await stripe.coupons.del(plan.saleStripeCouponId).catch(() => {});
}

export async function syncAddonPrice(addon: Addon): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe || addon.unitAmount <= 0) return null;

  const existing = addon.stripePriceId ?? priceForAddOn(addon.id as AddOnId);
  let productId: string;
  if (existing) {
    const ep = await stripe.prices.retrieve(existing);
    productId = typeof ep.product === "string" ? ep.product : ep.product.id;
  } else {
    const product = await stripe.products.create({
      name: `rootmail ${addon.name}`,
      metadata: { addonId: addon.id },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: addon.unitAmount * 100,
    recurring: { interval: "month" },
    metadata: { addonId: addon.id },
  });
  await stripe.products.update(productId, { default_price: price.id });
  if (addon.stripePriceId) {
    await stripe.prices.update(addon.stripePriceId, { active: false }).catch(() => {});
  }
  await db
    .update(addonsTable)
    .set({ stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(addonsTable.id, addon.id));
  return price.id;
}

/**
 * Create the discounted "sale price" for an add-on (percent off its unit price), on
 * the same product as its regular price. While a sale is active this is what
 * `priceForAddOn` bills. Archives any prior sale price. Returns the new price id, or
 * null without Stripe / a non-positive amount.
 */
export async function syncAddonSalePrice(addon: Addon, percentOff: number): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const saleAmount = Math.round(addon.unitAmount * (1 - percentOff / 100) * 100); // cents
  if (saleAmount <= 0) return null;

  const regular = addon.stripePriceId ?? envAddOnPriceId(addon.id as AddOnId);
  let productId: string;
  if (regular) {
    const ep = await stripe.prices.retrieve(regular);
    productId = typeof ep.product === "string" ? ep.product : ep.product.id;
  } else {
    const product = await stripe.products.create({
      name: `rootmail ${addon.name}`,
      metadata: { addonId: addon.id },
    });
    productId = product.id;
  }
  if (addon.saleStripePriceId) {
    await stripe.prices.update(addon.saleStripePriceId, { active: false }).catch(() => {});
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: saleAmount,
    recurring: { interval: "month" },
    metadata: { addonId: addon.id, kind: "addon_sale" },
  });
  await db
    .update(addonsTable)
    .set({ saleStripePriceId: price.id, updatedAt: new Date() })
    .where(eq(addonsTable.id, addon.id));
  return price.id;
}

/** Archive an add-on's sale price in Stripe (when an admin clears the sale). */
export async function deleteAddonSalePrice(addon: Addon): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !addon.saleStripePriceId) return;
  await stripe.prices.update(addon.saleStripePriceId, { active: false }).catch(() => {});
}

/**
 * Create/refresh the Stripe product + recurring price for a bespoke enterprise
 * plan (same immutable-price dance as plans, at the plan's own interval). Persists
 * the ids on the custom_plans row so the plan is real and billable. No-op without
 * Stripe or a positive price — the economics still apply locally either way.
 */
export async function syncCustomPlanPrice(cp: CustomPlan): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe || cp.priceCents <= 0) return null;

  let productId: string;
  if (cp.stripeProductId) {
    productId = cp.stripeProductId;
  } else {
    const product = await stripe.products.create({
      name: `rootmail ${cp.name}`,
      metadata: { organizationId: cp.organizationId, customPlanId: cp.id },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: cp.priceCents, // already cents
    recurring: { interval: cp.interval },
    metadata: { organizationId: cp.organizationId, customPlanId: cp.id },
  });
  await stripe.products.update(productId, { default_price: price.id });
  if (cp.stripePriceId) {
    await stripe.prices.update(cp.stripePriceId, { active: false }).catch(() => {});
  }
  await db
    .update(customPlans)
    .set({ stripeProductId: productId, stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(customPlans.id, cp.id));
  return price.id;
}

export interface CustomBillingResult {
  provisioned: boolean;
  reason?: string;
  subscription_id?: string;
}

/**
 * Provision billing for a custom plan as a SEND-INVOICE subscription (the honest
 * enterprise model — invoice the customer on agreed terms, don't silently charge a
 * card). Cancels any existing subscription first so they aren't double-billed.
 * Best-effort + status-reported; the plan economics already apply regardless.
 */
export async function provisionCustomSubscription(
  org: Organization,
  cp: CustomPlan,
): Promise<CustomBillingResult> {
  const stripe = getStripe();
  if (!stripe) return { provisioned: false, reason: "Stripe is not configured." };
  if (!cp.stripePriceId) return { provisioned: false, reason: "Custom plan has no Stripe price." };

  // Send-invoice billing requires an email on the customer — use the org owner's.
  const [owner] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, org.id), eq(memberships.role, "owner")))
    .limit(1);
  if (!owner?.email) {
    return { provisioned: false, reason: "The organization has no owner email to invoice." };
  }

  const customer = await ensureCustomer(org);
  await stripe.customers.update(customer, { email: owner.email });
  if (org.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(org.stripeSubscriptionId).catch(() => {});
  }
  const sub = await stripe.subscriptions.create({
    customer,
    items: [{ price: cp.stripePriceId }],
    collection_method: "send_invoice",
    days_until_due: 30,
    metadata: { organizationId: org.id, customPlanId: cp.id, custom: "true" },
  });
  await db
    .update(organizations)
    .set({
      stripeSubscriptionId: sub.id,
      planStatus: toPlanStatus(sub.status),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));
  return { provisioned: true, subscription_id: sub.id };
}

export interface CancelCustomResult {
  canceled: boolean;
  reason?: string;
  subscription_id?: string;
}

/**
 * Cancel the send-invoice subscription that backs a (now-deactivated) custom plan so
 * the customer stops being invoiced the bespoke price, then detach it from the org and
 * revert it to standard enterprise economics (plan stays "enterprise", planStatus
 * "active"). Only cancels a subscription that actually corresponds to THIS custom plan
 * — matched by the subscription's custom metadata or its price — so an unrelated
 * subscription is never touched. No-op without Stripe or a tracked subscription; the
 * economics revert locally either way. Lets Stripe errors propagate so the caller can
 * report them — deactivation itself never depends on this succeeding.
 */
export async function cancelCustomSubscription(
  org: Organization,
  cp: CustomPlan,
): Promise<CancelCustomResult> {
  const stripe = getStripe();
  if (!stripe) return { canceled: false, reason: "Stripe is not configured." };
  if (!org.stripeSubscriptionId) return { canceled: false, reason: "No subscription to cancel." };

  const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  // Guard: only cancel the subscription provisioned for THIS custom plan.
  const matchesPlan =
    sub.metadata?.customPlanId === cp.id ||
    (!!cp.stripePriceId && sub.items.data.some((i) => i.price?.id === cp.stripePriceId));
  if (!matchesPlan) {
    return { canceled: false, reason: "Org subscription doesn't match this custom plan." };
  }

  // Idempotent across retries: a subscription already canceled just needs detaching.
  if (sub.status !== "canceled") await stripe.subscriptions.cancel(sub.id);
  await db
    .update(organizations)
    .set({ stripeSubscriptionId: null, planStatus: "active", updatedAt: new Date() })
    .where(eq(organizations.id, org.id));
  return { canceled: true, subscription_id: sub.id };
}
