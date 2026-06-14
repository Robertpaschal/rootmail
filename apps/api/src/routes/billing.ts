import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, PLAN_IDS, PLANS, type PlanDef } from "@rootmail/core";
import { db, type Organization, organizations } from "@rootmail/db";
import { currentPeriod, quotaState } from "../lib/billing";
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

function billingPayload(org: Organization, usage: Awaited<ReturnType<typeof quotaState>>) {
  return {
    object: "billing",
    organization_id: org.id,
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
    plans: PLAN_IDS.map((id) => serializePlan(PLANS[id])),
  };
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/billing", async (req) => {
    const org = await orgForReq(req);
    return billingPayload(org, await quotaState(org));
  });

  // Switch plan. Production gates this behind a payment provider (Stripe
  // checkout); here it's the self-serve switch so the upgrade flow works.
  app.post("/v1/billing/plan", async (req) => {
    const { plan } = parse(z.object({ plan: z.enum(PLAN_IDS) }), req.body);
    const org = await orgForReq(req);
    const [updated] = await db
      .update(organizations)
      .set({ plan, updatedAt: new Date() })
      .where(eq(organizations.id, org.id))
      .returning();
    return billingPayload(updated, await quotaState(updated));
  });
}
