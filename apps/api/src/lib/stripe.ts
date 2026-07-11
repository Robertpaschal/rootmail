import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  ADD_ON_IDS,
  ADD_ONS,
  type AddOnId,
  type BillingInterval,
  BILLING_MODE,
  BLOCK_BRACKETS,
  CONTACT_UNIT,
  contactUnits,
  defaultTierId,
  env,
  newId,
  type PlanId,
  type PlanStatus,
  saleActive,
  TX_OVERAGE_METER_EVENT,
  type Wing,
  WINGS,
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
import { getTier, tiersForWing } from "./wings";

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

/** The metered overage price for transactional blocks ($/1,000 sends past the
 * purchased blocks), synced onto the blocks product by syncTierPrice. */
function txOveragePriceId(): string | null {
  return getTier("tx_blocks")?.stripeOveragePriceId ?? null;
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
  /** When given, only add-ons homed to this wing are reconciled — a wing sub must
   * never zero the OTHER wing's add-ons (they bill on their own subscription). */
  wing?: Wing,
): Promise<void> {
  const billed = new Map<AddOnId, number>();
  for (const item of sub.items.data) {
    const id = item.price?.id ? addOnForPrice(item.price.id) : null;
    if (id) billed.set(id, (billed.get(id) ?? 0) + (item.quantity ?? 0));
  }
  const scope = wing ? ADD_ON_IDS.filter((id) => ADD_ONS[id].wing === wing) : ADD_ON_IDS;
  for (const id of scope) {
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

export interface InvoiceSummary {
  id: string;
  number: string | null;
  created: number; // unix seconds
  amount_paid: number; // dollars
  amount_due: number; // dollars
  currency: string;
  status: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

/** Past invoices for an org's financial dashboard — most recent first, downloadable
 * (hosted URL + PDF). Empty when Stripe is off or the org has no customer yet. */
export async function listInvoices(org: Organization, limit = 24): Promise<InvoiceSummary[]> {
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) return [];
  try {
    const res = await stripe.invoices.list({ customer: org.stripeCustomerId, limit });
    return res.data.map((i) => ({
      id: i.id,
      number: i.number ?? null,
      created: i.created,
      amount_paid: (i.amount_paid ?? 0) / 100,
      amount_due: (i.amount_due ?? 0) / 100,
      currency: i.currency ?? "usd",
      status: i.status ?? null,
      hosted_invoice_url: i.hosted_invoice_url ?? null,
      invoice_pdf: i.invoice_pdf ?? null,
    }));
  } catch (err) {
    console.warn(`[stripe] invoice list failed for ${org.id}: ${String(err)}`);
    return [];
  }
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

// (Legacy single-plan checkout builders removed — per-wing checkout below is the
// only purchase path; add-ons attach to their wing's subscription via
// syncAddonItems, and blocks overage bills on the dedicated overage sub.)

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
  // The org-level ADD-ONS subscription → reconcile entitlements from what it bills
  // (covers Stripe-side edits), then stop; it never drives the plan/wings.
  if (sub.metadata?.kind === "addons") {
    const cid = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const [o] =
      (await db.select().from(organizations).where(eq(organizations.stripeCustomerId, cid)).limit(1)) ??
      [];
    const org2 =
      o ??
      (sub.metadata?.organizationId
        ? (await db.select().from(organizations).where(eq(organizations.id, sub.metadata.organizationId)).limit(1))[0]
        : undefined);
    if (org2) {
      const st = toPlanStatus(sub.status);
      // A fresh unpaid add-ons checkout must not grant the add-ons — wait for payment.
      if (st === "incomplete" && org2.stripePlatformSubscriptionId !== sub.id) return;
      // Track the add-ons sub id on first (embedded-checkout) completion; clear on cancel.
      const nextSubId = st === "canceled" ? null : sub.id;
      if (org2.stripePlatformSubscriptionId !== nextSubId) {
        await db
          .update(organizations)
          .set({ stripePlatformSubscriptionId: nextSubId, updatedAt: new Date() })
          .where(eq(organizations.id, org2.id));
      }
      // The org-level add-ons sub bills ALL add-ons — reconcile them all.
      await reconcileAddonsFromSubscription(org2.id, sub);
    }
    return;
  }
  // Per-wing subscriptions carry a `wing` — route to the wing resolver, never the
  // legacy single-plan one (which would clobber org.plan / the shared subscription id).
  if (sub.metadata?.wing) {
    await syncWingSubscription(sub);
    return;
  }

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
  // A fresh INCOMPLETE (unpaid/abandoned) checkout must not apply the plan — only a
  // sub already tracked by the org may transition it (e.g. active → past_due).
  if (status === "incomplete" && org.stripeSubscriptionId !== sub.id) return;
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
 * Reconcile an org's add-ons with its `org_addons` rows on ONE org-level add-ons
 * subscription (`stripePlatformSubscriptionId`). Add-ons are wing-agnostic now
 * (there is no Platform plan) — seats, workspaces, client domains, dedicated IPs,
 * AI packs, roles, SSO, proof, residency all bill here. Creates the subscription on
 * first add-on, cancels it when the last one is removed. No wing gating — any org
 * can buy an add-on. No-op without Stripe (local mode applies org_addons directly).
 */
export async function syncAddonItems(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const addonPrices = addOnPriceIds();
  const want = new Map<string, number>();
  for (const a of await loadAddonQuantities(org.id)) {
    // ALL add-ons bill (monthly) on this one org-level add-ons subscription.
    const price = priceForAddOn(a.id, "month");
    if (price && a.quantity > 0) want.set(price, a.quantity);
  }

  const subId = org.stripePlatformSubscriptionId;

  // Nothing wanted → cancel the add-ons subscription if one exists.
  if (want.size === 0) {
    if (subId) {
      await stripe.subscriptions.cancel(subId).catch(() => {});
      await db
        .update(organizations)
        .set({ stripePlatformSubscriptionId: null, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
    }
    return;
  }

  // Billing is FAIL-SOFT: the entitlement (org_addons rows) is already set by the
  // caller, so a Stripe hiccup — no card on a Free-on-both org, a transient error —
  // must never strip the add-on. We attempt to bill; if we can't, the add-on stays
  // granted and billing reconciles once a payment method exists (e.g. after a wing
  // checkout) or an admin acts. Mirrors the module's overall fail-soft contract.
  try {
    await syncAddonSubscription(stripe, org, want, subId, addonPrices);
  } catch (err) {
    console.warn(`[stripe] add-on billing deferred for ${org.id}: ${String(err)}`);
  }
}

async function syncAddonSubscription(
  stripe: Stripe,
  org: Organization,
  want: Map<string, number>,
  subId: string | null,
  addonPrices: Set<string>,
): Promise<void> {
  const customer = await ensureCustomer(org);
  const sub = subId ? await stripe.subscriptions.retrieve(subId).catch(() => null) : null;

  // No live sub → create one carrying all wanted add-ons. Add-ons are wing-agnostic
  // and any org can buy them (including Free-on-both), which may have no card on
  // file — so this sub is invoiced (`send_invoice`) rather than auto-charged, which
  // also surfaces cleanly in the financial dashboard's downloadable invoices.
  if (!sub) {
    // An invoiced subscription must have a customer email — set it from the org owner.
    const owner = await ownerContactForCustomer(customer);
    if (owner?.email) {
      await stripe.customers.update(customer, { email: owner.email }).catch(() => {});
    }
    const items = [...want].map(([price, quantity]) => ({ price, quantity }));
    const created = await stripe.subscriptions.create({
      customer,
      items,
      collection_method: "send_invoice",
      days_until_due: 14,
      metadata: { organizationId: org.id, kind: "addons" },
    });
    await db
      .update(organizations)
      .set({ stripePlatformSubscriptionId: created.id, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
    return;
  }

  // Reconcile the existing add-ons sub's items to the wanted set.
  const remaining = new Map(want);
  for (const item of sub.items.data) {
    const priceId = item.price.id;
    if (!addonPrices.has(priceId)) continue;
    const qty = remaining.get(priceId);
    if (qty && qty > 0) {
      if (item.quantity !== qty) await stripe.subscriptionItems.update(item.id, { quantity: qty });
      remaining.delete(priceId);
    } else {
      await stripe.subscriptionItems.del(item.id);
    }
  }
  for (const [priceId, qty] of remaining) {
    if (qty > 0) await stripe.subscriptionItems.create({ subscription: sub.id, price: priceId, quantity: qty });
  }
}

/**
 * Report this month's TRANSACTIONAL overage to Stripe's Billing Meter (1 unit =
 * 1,000 sends past the purchased blocks). Meters aggregate by sum, so only the
 * DELTA since the last report is sent. Overage always bills on the dedicated
 * monthly overage subscription (one path for monthly AND yearly blocks — Stripe
 * forbids mixing intervals, and a second $0-until-used sub keeps checkout clean).
 * Free-allowance orgs hard-cap instead (no overage). Lazy + best-effort.
 */
export async function reportOverage(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) return;
  if ((org.transactionalBlocks ?? 0) <= 0) return; // free allowance hard-caps; enterprise custom-billed
  if (!txOveragePriceId()) return; // metered price not synced yet

  // Make sure the dedicated overage sub exists before reporting usage.
  await reconcileOverageSubscription(org);

  const used = await getUsage(org.id);
  const quota = planForOrg(org).monthlyQuota;
  const units = Math.max(0, Math.ceil((used - quota) / 1000));
  const alreadyReported = await getReportedOverage(org.id);
  const delta = units - alreadyReported;
  if (delta <= 0) return; // nothing new this period

  await stripe.billing.meterEvents.create({
    event_name: TX_OVERAGE_METER_EVENT,
    payload: { value: String(delta), stripe_customer_id: org.stripeCustomerId },
  });
  await setReportedOverage(org.id, units);
}

/**
 * Keep the dedicated monthly overage subscription in sync with the org's blocks:
 * blocks purchased → the sub exists ($0 until overage accrues); no blocks → it's
 * cancelled. Idempotent; called from the wing webhook (purchase/downgrade) and
 * lazily from `reportOverage`.
 */
export async function reconcileOverageSubscription(org: Organization): Promise<void> {
  const stripe = getStripe();
  if (!stripe || !org.stripeCustomerId) return;

  const overagePrice = txOveragePriceId();
  const shouldHave = (org.transactionalBlocks ?? 0) > 0 && overagePrice != null;

  if (shouldHave && !org.stripeOverageSubscriptionId) {
    try {
      // Metered price, no quantity. The idempotency key collapses the races from
      // concurrent sends (each fires reportOverage → reconcile) into one sub.
      const sub = await stripe.subscriptions.create(
        {
          customer: org.stripeCustomerId,
          items: [{ price: overagePrice! }],
          metadata: { organizationId: org.id, kind: "overage", wing: "transactional" },
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
    // Blocks gone (downgrade to the free allowance) → stop the dedicated sub.
    // Clearing the id is safe even if the cancel 404s (already gone).
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
  const isBlocks = tier.id === "tx_blocks";
  // Marketing paid tiers bill by CONTACT SIZE — a per-CONTACT_UNIT quantity price
  // (unit = 100 contacts), so a bigger audience on the same tier costs more.
  const isMarketingPaid = tier.wing === "marketing" && (tier.perThousandCents ?? 0) > 0;
  const mkUnitCents = Math.round(((tier.perThousandCents ?? 0) * CONTACT_UNIT) / 1000);
  const flatPaid = tier.priceMonthly != null && tier.priceMonthly > 0;
  if (!stripe || (!isBlocks && !isMarketingPaid && !flatPaid)) return null;

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

  // Blocks bill quantity × per-block with VOLUME discounts (Stripe tiered scheme);
  // marketing bills quantity (contacts/100) × a flat per-unit rate; everything else
  // is a flat monthly/yearly price.
  const volumeTiers = (multiplier: number): Stripe.PriceCreateParams.Tier[] =>
    BLOCK_BRACKETS.map((b, i) => ({
      up_to: i === BLOCK_BRACKETS.length - 1 ? ("inf" as const) : b.upToBlocks,
      unit_amount: Math.round(b.perBlock * multiplier * 100),
    }));
  const priceShape = (multiplier: number): Record<string, unknown> =>
    isBlocks
      ? { billing_scheme: "tiered", tiers_mode: "volume", tiers: volumeTiers(multiplier) }
      : isMarketingPaid
        ? { unit_amount: mkUnitCents * multiplier }
        : { unit_amount: (multiplier === 1 ? tier.priceMonthly! : (tier.priceYearly ?? tier.priceMonthly! * 10)) * 100 };

  const month = await stripe.prices.create({
    product: productId,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { tierId: tier.id, wing: tier.wing, interval: "month" },
    ...priceShape(1),
  });
  const year = await stripe.prices.create({
    product: productId,
    currency: "usd",
    recurring: { interval: "year" },
    metadata: { tierId: tier.id, wing: tier.wing, interval: "year" },
    ...priceShape(10), // 2 months free
  });
  await stripe.products.update(productId, { default_price: month.id });

  // Blocks also get the METERED overage price ($/1,000 sends past the purchased
  // blocks) on a global Billing Meter — billed via the dedicated overage sub.
  let overagePriceId: string | null = tier.stripeOveragePriceId ?? null;
  if (isBlocks && tier.overagePer1000Cents > 0) {
    const meters = await stripe.billing.meters.list({ status: "active" });
    let meter = meters.data.find((m) => m.event_name === TX_OVERAGE_METER_EVENT);
    meter ??= await stripe.billing.meters.create({
      display_name: "rootmail transactional overage (1k sends)",
      event_name: TX_OVERAGE_METER_EVENT,
      default_aggregation: { formula: "sum" },
      customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
      value_settings: { event_payload_key: "value" },
    });
    const overage = await stripe.prices.create({
      product: productId,
      currency: "usd",
      unit_amount: tier.overagePer1000Cents,
      recurring: { interval: "month", usage_type: "metered", meter: meter.id },
      metadata: { tierId: tier.id, wing: tier.wing, kind: "overage" },
    });
    if (tier.stripeOveragePriceId) {
      await stripe.prices.update(tier.stripeOveragePriceId, { active: false }).catch(() => {});
    }
    overagePriceId = overage.id;
  }

  // Grandfather: archive only the previously-synced prices (current subs keep billing).
  if (tier.stripePriceMonthId) await stripe.prices.update(tier.stripePriceMonthId, { active: false }).catch(() => {});
  if (tier.stripePriceYearId) await stripe.prices.update(tier.stripePriceYearId, { active: false }).catch(() => {});

  await db
    .update(pricingTiers)
    .set({
      stripePriceMonthId: month.id,
      stripePriceYearId: year.id,
      stripeOveragePriceId: overagePriceId,
      updatedAt: new Date(),
    })
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
    const paid =
      t.id === "tx_blocks" ||
      (t.wing === "marketing" && (t.perThousandCents ?? 0) > 0) ||
      (t.priceMonthly != null && t.priceMonthly > 0);
    if (paid) {
      await syncTierPrice(t);
      synced++;
    }
  }
  return { synced };
}

// --- Per-wing subscriptions (PRICING-WINGS-SPEC.md, Phase D.2) -----------------
// Each wing is its OWN Stripe subscription. The tier's price carries `wing`
// metadata, so the webhook routes it to the right org column.

/** The org columns to write for a wing — its tier id + its Stripe subscription id
 * (+ the purchased block count on the transactional wing). */
function wingUpdate(
  wing: Wing,
  tierId: string | null,
  subId: string | null,
  opts: { blocks?: number; contacts?: number } = {},
) {
  switch (wing) {
    case "transactional":
      return {
        transactionalTier: tierId,
        stripeTxSubscriptionId: subId,
        transactionalBlocks: opts.blocks ?? 0,
      };
    case "marketing":
      return {
        marketingTier: tierId,
        stripeMkSubscriptionId: subId,
        marketingContacts: opts.contacts ?? 0,
      };
    case "platform":
      // Platform-as-a-plan is gone; nothing to write here.
      return { platformTier: tierId };
  }
}

/** The org's current Stripe subscription id for a wing (to cancel on downgrade). */
export function wingSubscriptionId(org: Organization, wing: Wing): string | null {
  return wing === "transactional"
    ? org.stripeTxSubscriptionId
    : wing === "marketing"
      ? org.stripeMkSubscriptionId
      : org.stripePlatformSubscriptionId;
}

/** Stripe price id for a wing tier at the interval (synced by syncTierPrice), or null. */
export function priceForWingTier(tierId: string, interval: BillingInterval = "month"): string | null {
  const t = getTier(tierId);
  if (!t) return null;
  return (interval === "year" ? t.stripePriceYearId : t.stripePriceMonthId) ?? null;
}

/** Reverse lookup: which wing tier does a Stripe price id belong to? */
function tierForPrice(priceId: string): { tierId: string; wing: Wing } | null {
  for (const wing of WINGS) {
    for (const t of tiersForWing(wing)) {
      if (t.stripePriceMonthId === priceId || t.stripePriceYearId === priceId) {
        return { tierId: t.id, wing };
      }
    }
  }
  return null;
}

/** Directly set an org's wing tier (free tiers + local mode — no Stripe charge).
 * Clears any Stripe sub id for that wing (the caller cancels the sub if one exists). */
export async function assignWingTier(
  orgId: string,
  wing: Wing,
  tierId: string,
  opts: { blocks?: number; contacts?: number } = {},
): Promise<void> {
  await db
    .update(organizations)
    .set({ ...wingUpdate(wing, tierId, null, opts), updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

/** Cancel a wing's Stripe subscription if it has one (best-effort; used on
 * downgrade-to-free). Safe if already gone. */
export async function cancelWingSubscription(org: Organization, wing: Wing): Promise<void> {
  const stripe = getStripe();
  const subId = wingSubscriptionId(org, wing);
  if (!stripe || !subId) return;
  await stripe.subscriptions.cancel(subId).catch(() => {});
}

/** Start a per-wing subscription checkout (hosted). Returns a Stripe redirect URL,
 * else `{ mode: "local" }` (no Stripe / no synced price) so the caller assigns
 * directly. The session's metadata carries `wing` + `tierId` for the webhook. */
export async function createWingCheckout(
  org: Organization,
  tierId: string,
  interval: BillingInterval = "month",
  opts: { blocks?: number; contacts?: number } = {},
): Promise<CheckoutResult> {
  const stripe = getStripe();
  const tier = getTier(tierId);
  const price = priceForWingTier(tierId, interval);
  if (!stripe || !tier || !price) return { mode: "local" };

  // Blocks bill quantity × per-block (volume-tiered); marketing bills quantity =
  // contacts/CONTACT_UNIT; everything else is a single unit.
  const quantity =
    tierId === "tx_blocks"
      ? Math.max(1, opts.blocks ?? 1)
      : tier.wing === "marketing" && (tier.perThousandCents ?? 0) > 0
        ? contactUnits(opts.contacts ?? CONTACT_UNIT)
        : 1;

  try {
    const customer = await ensureCustomer(org);
    const base = env.DASHBOARD_URL.replace(/\/$/, "");
    const meta = {
      organizationId: org.id,
      wing: tier.wing,
      tierId,
      interval,
      ...(opts.contacts ? { contacts: String(opts.contacts) } : {}),
    };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity }],
      success_url: `${base}/billing/${tier.wing}?checkout=success`,
      cancel_url: `${base}/billing/${tier.wing}?checkout=cancel`,
      metadata: meta,
      subscription_data: { metadata: meta },
      allow_promotion_codes: true,
    });
    if (session.url) return { mode: "stripe", url: session.url };
  } catch (err) {
    console.warn(`[stripe] wing checkout failed, falling back to local: ${String(err)}`);
  }
  return { mode: "local" };
}

export interface EmbeddedResult {
  mode: "embedded" | "unavailable";
  client_secret?: string;
  publishable_key?: string;
}

const embeddedReturn = (base: string) =>
  `${base}/billing?checkout=complete&session_id={CHECKOUT_SESSION_ID}`;

/** In-app (embedded) checkout for a per-wing tier — same subscription/quantity as
 * the hosted flow, but returns a client_secret to mount inline (no redirect), so
 * users edit selections back and forth. `{ mode: "unavailable" }` when Stripe, the
 * price, or the publishable key isn't configured (caller falls back). */
export async function createWingEmbeddedCheckout(
  org: Organization,
  tierId: string,
  interval: BillingInterval = "month",
  opts: { blocks?: number; contacts?: number; addons?: Partial<Record<AddOnId, number>> } = {},
): Promise<EmbeddedResult> {
  const stripe = getStripe();
  const tier = getTier(tierId);
  const price = priceForWingTier(tierId, interval);
  const pk = env.STRIPE_PUBLISHABLE_KEY;
  if (!stripe || !tier || !price || !pk) return { mode: "unavailable" };

  const quantity =
    tierId === "tx_blocks"
      ? Math.max(1, opts.blocks ?? 1)
      : tier.wing === "marketing" && (tier.perThousandCents ?? 0) > 0
        ? contactUnits(opts.contacts ?? CONTACT_UNIT)
        : 1;
  // Add-ons are inherently MONTHLY and bill on the org-level add-ons subscription —
  // never on a wing sub (mixing monthly add-ons with a yearly plan on one Stripe
  // subscription is rejected). So any add-ons chosen here are carried as PENDING in
  // metadata and applied to the org-level add-ons sub once the plan is paid (the
  // customer then has a card on file). For the user it's still one checkout: the
  // order summary shows plan + add-ons, and everything lands together.
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price, quantity }];
  const pending: Partial<Record<AddOnId, number>> = {};
  for (const id of ADD_ON_IDS) {
    const q = Math.max(0, Math.floor(opts.addons?.[id] ?? 0));
    if (q > 0) pending[id] = q;
  }
  try {
    const customer = await ensureCustomer(org);
    const meta = {
      organizationId: org.id,
      wing: tier.wing,
      tierId,
      interval,
      ...(opts.contacts ? { contacts: String(opts.contacts) } : {}),
      ...(Object.keys(pending).length ? { pendingAddons: JSON.stringify(pending) } : {}),
    };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // This SDK pins an API version whose embedded UI mode is "embedded_page"
      // (stable alias "embedded"); @stripe/react-stripe-js consumes the client_secret either way.
      ui_mode: "embedded_page",
      customer,
      line_items,
      return_url: embeddedReturn(env.DASHBOARD_URL.replace(/\/$/, "")),
      metadata: meta,
      subscription_data: { metadata: meta },
    });
    if (session.client_secret) {
      return { mode: "embedded", client_secret: session.client_secret, publishable_key: pk };
    }
  } catch (err) {
    console.warn(`[stripe] wing embedded checkout failed: ${String(err)}`);
  }
  return { mode: "unavailable" };
}

/** In-app (embedded) checkout for a set of ADD-ONS — creates the org-level add-ons
 * subscription with a card collected (charge_automatically), so the selections
 * "add up" to a real payment. `quantities` is the DESIRED full add-on set. The
 * webhook (kind: "addons") reconciles org_addons + records the sub id on
 * completion. Unavailable → caller falls back to the direct apply. */
export async function createAddonsEmbeddedCheckout(
  org: Organization,
  quantities: Partial<Record<AddOnId, number>>,
): Promise<EmbeddedResult> {
  const stripe = getStripe();
  const pk = env.STRIPE_PUBLISHABLE_KEY;
  if (!stripe || !pk) return { mode: "unavailable" };

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const id of ADD_ON_IDS) {
    const qty = quantities[id] ?? 0;
    const price = priceForAddOn(id, "month");
    if (qty > 0 && price) lineItems.push({ price, quantity: qty });
  }
  if (lineItems.length === 0) return { mode: "unavailable" };

  try {
    const customer = await ensureCustomer(org);
    const meta = { organizationId: org.id, kind: "addons" };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // This SDK pins an API version whose embedded UI mode is "embedded_page"
      // (stable alias "embedded"); @stripe/react-stripe-js consumes the client_secret either way.
      ui_mode: "embedded_page",
      customer,
      line_items: lineItems,
      return_url: embeddedReturn(env.DASHBOARD_URL.replace(/\/$/, "")),
      metadata: meta,
      subscription_data: { metadata: meta },
    });
    if (session.client_secret) {
      return { mode: "embedded", client_secret: session.client_secret, publishable_key: pk };
    }
  } catch (err) {
    console.warn(`[stripe] add-ons embedded checkout failed: ${String(err)}`);
  }
  return { mode: "unavailable" };
}

/** Webhook: apply a per-wing subscription to its org column. Recognized by the
 * `wing` metadata (syncSubscription delegates here). Canceled → that wing drops
 * back to its Free tier. */
export async function syncWingSubscription(sub: Stripe.Subscription): Promise<void> {
  // The dedicated overage sub also carries `wing` metadata for bookkeeping — it must
  // never drive the wing tier (its guard in syncSubscription fires first; this is
  // defense in depth for direct callers).
  if (sub.metadata?.kind === "overage") return;
  const wing = sub.metadata?.wing as Wing | undefined;
  if (!wing || !WINGS.includes(wing)) return;

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

  const status = toPlanStatus(sub.status);
  // An INCOMPLETE subscription (checkout started but not yet paid — or abandoned,
  // which Stripe lands in incomplete_expired) must NOT apply the tier: doing so
  // showed users the upgrade after they cancelled checkout. Only a paid/committed
  // status applies; canceled/expired drops the wing to Free.
  if (status === "incomplete") {
    // If this is the org's currently-tracked sub going bad, drop to Free; otherwise
    // it's a fresh unpaid checkout — leave the org exactly as it was.
    if (wingSubscriptionId(org, wing) === sub.id) {
      await db
        .update(organizations)
        .set({ ...wingUpdate(wing, defaultTierId(wing), null), updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
    }
    return;
  }
  if (status === "canceled") {
    // Drop this wing to its Free tier + detach the sub (the other wings are untouched).
    await db
      .update(organizations)
      .set({ ...wingUpdate(wing, defaultTierId(wing), null), updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
  } else {
    // Which tier is billed — from the sub's price, else the metadata tierId — plus the
    // quantity: blocks (transactional) or contacts = quantity × CONTACT_UNIT (marketing).
    let tierId: string | null = null;
    let quantity = 0;
    for (const item of sub.items.data) {
      const match = item.price?.id ? tierForPrice(item.price.id) : null;
      if (match && match.wing === wing) {
        tierId = match.tierId;
        quantity = item.quantity ?? 1;
        break;
      }
    }
    tierId ??= sub.metadata?.tierId ?? defaultTierId(wing);
    const blocks = tierId === "tx_blocks" ? Math.max(1, quantity) : 0;
    const contacts =
      wing === "marketing" && tierId !== "mk_free"
        ? Math.max(CONTACT_UNIT, quantity * CONTACT_UNIT)
        : 0;

    // A new checkout mints a NEW subscription — cancel the wing's PRIOR one so an
    // upgrade/quantity change doesn't leave the customer double-billed.
    const priorSubId = wingSubscriptionId(org, wing);
    const stripe = getStripe();
    if (stripe && priorSubId && priorSubId !== sub.id) {
      await stripe.subscriptions.cancel(priorSubId).catch(() => {});
    }

    await db
      .update(organizations)
      .set({ ...wingUpdate(wing, tierId, sub.id, { blocks, contacts }), updatedAt: new Date() })
      .where(eq(organizations.id, org.id));

    // Add-ons chosen during this purchase were carried as PENDING (they bill
    // monthly on the org-level add-ons sub, never on a wing sub). Now that the plan
    // is paid and a card is on file, apply them. Set to the chosen quantity, then
    // reconcile the org-level add-ons subscription.
    const pendingRaw = sub.metadata?.pendingAddons;
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw) as Partial<Record<AddOnId, number>>;
        for (const id of ADD_ON_IDS) {
          const q = pending[id];
          if (q == null) continue;
          await db
            .insert(orgAddons)
            .values({ id: newId("orgAddon"), organizationId: org.id, addonId: id, quantity: q })
            .onConflictDoUpdate({ target: [orgAddons.organizationId, orgAddons.addonId], set: { quantity: q, updatedAt: new Date() } });
          if (id === "dedicated_ip") await syncDedicatedIpProvisioning(org.id, q);
        }
        const [withPending] = await db.select().from(organizations).where(eq(organizations.id, org.id)).limit(1);
        if (withPending) await syncAddonItems(withPending);
      } catch (err) {
        console.warn(`[stripe] pending add-ons apply failed for ${org.id}: ${String(err)}`);
      }
    }
  }

  // For transactional, keep the dedicated overage sub in sync (created on first
  // blocks purchase; cancelled when blocks go away).
  const [fresh] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  if (fresh && wing === "transactional") await reconcileOverageSubscription(fresh);
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

/** Provision Stripe prices for every add-on — run once after seeding the catalog
 * (add-ons are wing-agnostic and bill on the org-level add-ons subscription).
 * Idempotent-safe (mints fresh prices + archives the old). Returns how many synced. */
export async function syncAllAddonPrices(): Promise<{ synced: number }> {
  const stripe = getStripe();
  if (!stripe) return { synced: 0 };
  const rows = await db.select().from(addonsTable);
  let synced = 0;
  for (const a of rows) {
    if (a.unitAmount > 0) {
      await syncAddonPrice(a);
      synced++;
    }
  }
  return { synced };
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
