import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import {
  env,
  Errors,
  featureUnlocked,
  type PlanFeature,
  PLANS,
  requiredPlanFor,
} from "@rootmail/core";
import { db, memberships, type Organization, organizations } from "@rootmail/db";

/** Load the org behind the authenticated request's workspace. */
export async function loadOrg(req: FastifyRequest): Promise<Organization> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, req.auth.workspace.organizationId))
    .limit(1);
  if (!org) throw Errors.notFound("Organization not found");
  return org;
}

/**
 * Only an org owner/admin may perform the action. API keys act on behalf of the
 * account (the key holder is the account), so they pass; a session user must
 * hold an owner/admin membership.
 */
export async function assertOrgAdmin(req: FastifyRequest, org: Organization): Promise<void> {
  if (req.auth.apiKey) return;
  if (req.auth.user) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, req.auth.user.id), eq(memberships.organizationId, org.id)))
      .limit(1);
    if (m && (m.role === "owner" || m.role === "admin")) return;
    throw Errors.forbidden("Only an organization owner or admin can do this.");
  }
  throw Errors.forbidden("Not allowed.");
}

/**
 * Gate a route on a plan feature. Returns the org so callers that also need it
 * avoid a second load. Throws 402 `feature_locked` — carrying which plan
 * unlocks the feature, its price, and how to upgrade — when the caller's plan
 * doesn't include it, so a dev can act straight from the response.
 */
export async function requireFeature(
  req: FastifyRequest,
  feature: PlanFeature,
): Promise<Organization> {
  const org = await loadOrg(req);
  if (featureUnlocked(org.plan, feature)) return org;

  const required = requiredPlanFor(feature);
  const requiredPlan = required ? PLANS[required] : null;
  throw Errors.featureLocked(feature, {
    current_plan: org.plan,
    required_plan: required,
    required_plan_name: requiredPlan?.name ?? null,
    price: requiredPlan?.price ?? null,
    upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
    checkout_endpoint: "POST /v1/billing/checkout",
    docs_url: `https://${env.ROOTMAIL_DOMAIN}/pricing`,
  });
}
