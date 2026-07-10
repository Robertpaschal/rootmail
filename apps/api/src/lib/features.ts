import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { env, Errors, type PlanFeature } from "@rootmail/core";
import { db, memberships, type Organization, organizations } from "@rootmail/db";
import { requiredTierFor, wingFeatureUnlocked } from "./wings";

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
  if (wingFeatureUnlocked(org, feature)) return org;

  // Locked → say exactly which WING TIER unlocks it, and send them to the per-wing
  // pricing page (the only pricing there is).
  const tier = requiredTierFor(feature);
  throw Errors.featureLocked(feature, {
    current_plan: org.plan,
    required_plan: tier?.id ?? null,
    required_plan_name: tier ? `${tier.name} (${tier.wing})` : null,
    required_wing: tier?.wing ?? null,
    price: tier?.priceMonthly ?? null,
    upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing/${tier?.wing ?? "transactional"}`,
    checkout_endpoint: "POST /v1/billing/wing/checkout",
    docs_url: `https://${env.ROOTMAIL_DOMAIN}/pricing`,
  });
}
