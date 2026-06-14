import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  ADD_ONS,
  type AddOnId,
  BILLING_MODE,
  env,
  type PlanId,
  type PlanStatus,
} from "@rootmail/core";
import { db, type Organization, organizations } from "@rootmail/db";

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

/** Configured Stripe price id for a plan's recurring base, or null. */
export function priceForPlan(planId: PlanId): string | null {
  if (planId === "pro") return env.STRIPE_PRICE_PRO ?? null;
  if (planId === "scale") return env.STRIPE_PRICE_SCALE ?? null;
  return null; // free = cancel; enterprise = sales-assisted (no self-serve price)
}

/** Configured Stripe price id for an add-on, or null (→ use default constant). */
export function priceForAddOn(id: AddOnId): string | null {
  const val = env[ADD_ONS[id].priceEnvKey as keyof typeof env];
  return typeof val === "string" && val ? val : null;
}

/** Reverse lookup: which plan does a Stripe price id correspond to? */
function planForPrice(priceId: string): PlanId | null {
  if (env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (env.STRIPE_PRICE_SCALE && priceId === env.STRIPE_PRICE_SCALE) return "scale";
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
export async function createCheckout(org: Organization, planId: PlanId): Promise<CheckoutResult> {
  const stripe = getStripe();
  const price = priceForPlan(planId);
  if (!stripe || !price) return { mode: "local" };

  try {
    const customer = await ensureCustomer(org);
    const base = env.DASHBOARD_URL.replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancel`,
      metadata: { organizationId: org.id, planId },
      subscription_data: { metadata: { organizationId: org.id, planId } },
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
