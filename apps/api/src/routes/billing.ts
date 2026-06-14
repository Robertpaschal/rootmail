import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ADD_ONS, BILLING_MODE, Errors, PLAN_IDS, PLANS, type PlanDef } from "@rootmail/core";
import { db, memberships, type Organization, organizations } from "@rootmail/db";
import { currentPeriod, type QuotaState, quotaState } from "../lib/billing";
import { createCheckout } from "../lib/stripe";
import { parse } from "../lib/validate";

function serializePlan(p: PlanDef) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    monthly_quota: p.monthlyQuota,
    allow_overage: p.allowOverage,
    overage_per_1000: p.overagePer1000,
    included_sub_tenants: p.includedSubTenants,
    seats: p.seats,
    features: p.features,
  };
}

async function orgForReq(req: FastifyRequest): Promise<Organization> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, req.auth.workspace.organizationId))
    .limit(1);
  if (!org) throw Errors.notFound("Organization not found");
  return org;
}

/**
 * Only an org owner/admin may change billing. API keys act on behalf of the
 * account (the dev IS the account holder), so they're allowed — and in Stripe
 * mode the call only ever returns a payment URL, so nothing changes without a
 * completed checkout.
 */
async function assertBillingActor(req: FastifyRequest, org: Organization): Promise<void> {
  if (req.auth.apiKey) return;
  if (req.auth.user) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, req.auth.user.id), eq(memberships.organizationId, org.id)))
      .limit(1);
    if (m && (m.role === "owner" || m.role === "admin")) return;
    throw Errors.forbidden("Only an organization owner or admin can change billing.");
  }
  throw Errors.forbidden("Not allowed to change billing.");
}

/**
 * The collective bill: what the org will be charged this period, broken into
 * line items (plan base + metered overage; seats/add-ons join in a later phase).
 * Amounts come from the PLANS defaults, so this is always populated even when
 * Stripe is offline.
 */
function billingSummary(usage: QuotaState) {
  const plan = usage.plan;
  const lines: Array<{ label: string; kind: string; amount: number }> = [
    { label: `${plan.name} plan`, kind: "base", amount: plan.price ?? 0 },
  ];
  if (usage.overage_cost > 0) {
    lines.push({
      label: `Overage · ${usage.overage.toLocaleString()} emails`,
      kind: "overage",
      amount: usage.overage_cost,
    });
  }
  return {
    currency: "usd",
    custom: plan.price === null,
    lines,
    seats: {
      included: plan.seats,
      purchased: 0,
      unit_price: ADD_ONS.extra_seat.defaultUnitAmount,
    },
    add_ons: [] as Array<{
      id: string;
      name: string;
      quantity: number;
      unit_amount: number;
      amount: number;
    }>,
    total: lines.reduce((s, l) => s + l.amount, 0),
  };
}

function billingPayload(org: Organization, usage: QuotaState) {
  return {
    object: "billing",
    organization_id: org.id,
    billing_mode: BILLING_MODE,
    plan_status: org.planStatus,
    plan: serializePlan(usage.plan),
    usage: {
      period: currentPeriod(),
      used: usage.used,
      quota: usage.quota,
      remaining: usage.remaining,
      overage: usage.overage,
      overage_cost: usage.overage_cost,
      over_limit: usage.over_limit,
    },
    summary: billingSummary(usage),
    plans: PLAN_IDS.map((id) => serializePlan(PLANS[id])),
  };
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/billing", async (req) => {
    const org = await orgForReq(req);
    return billingPayload(org, await quotaState(org));
  });

  // Start a plan change. In Stripe mode returns a hosted Checkout URL; in local
  // mode (or if a price can't be resolved) applies the switch directly so the
  // self-serve flow keeps working. This is the endpoint a feature_locked
  // response points devs to.
  app.post("/v1/billing/checkout", async (req) => {
    const { plan } = parse(z.object({ plan: z.enum(PLAN_IDS) }), req.body);
    const org = await orgForReq(req);
    await assertBillingActor(req, org);

    if (plan === "enterprise") {
      throw Errors.badRequest("Enterprise is sales-assisted — contact sales to upgrade.");
    }

    const result = await createCheckout(org, plan);
    if (result.mode === "stripe" && result.url) {
      return { object: "checkout", mode: "stripe", url: result.url };
    }

    // Local fallback (no Stripe, or price unresolved): apply directly.
    const [updated] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", updatedAt: new Date() })
      .where(eq(organizations.id, org.id))
      .returning();
    return { object: "checkout", mode: "local", billing: billingPayload(updated, await quotaState(updated)) };
  });

  // Direct plan switch — local mode only. In Stripe mode, plan changes must go
  // through Checkout (so payment is collected) — callers are redirected there.
  app.post("/v1/billing/plan", async (req) => {
    const { plan } = parse(z.object({ plan: z.enum(PLAN_IDS) }), req.body);
    const org = await orgForReq(req);
    await assertBillingActor(req, org);
    if (BILLING_MODE === "stripe") {
      throw Errors.badRequest("Stripe billing is enabled — use POST /v1/billing/checkout.");
    }
    const [updated] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", updatedAt: new Date() })
      .where(eq(organizations.id, org.id))
      .returning();
    return billingPayload(updated, await quotaState(updated));
  });
}
