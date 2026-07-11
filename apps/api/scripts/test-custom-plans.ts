/**
 * Custom / enterprise plan flow — needs the API running (`pnpm api`), no seed. Runs
 * with or without Stripe: the Stripe-mode assertions (billing → real subscription,
 * deactivate → canceled subscription) are skipped in local mode. Verifies the whole
 * Phase-2 slice:
 *   - POST /v1/admin/orgs/:id/custom-plan creates the plan, puts the org on
 *     enterprise, and converts a linked lead → won + linked
 *   - the per-org resolver ENFORCES the custom economics (quota/overage/seats/AI)
 *     while features come from enterprise (sso/proof unlocked)
 *   - re-save upserts the same row (one plan per org)
 *   - bill provisions a send-invoice subscription (Stripe mode) or is reported
 *     unavailable (local mode → 400 with a reason)
 *   - deactivate reverts the org to standard enterprise economics AND (in Stripe
 *     mode) cancels + detaches the bespoke subscription so billing matches
 * Creates a throwaway org + superadmin + lead and cleans them all up.
 */
import { eq } from "drizzle-orm";
import { hashPassword, newId } from "@rootmail/core";
import {
  closeDb,
  customPlans,
  db,
  leadNotes,
  leads,
  memberships,
  organizations,
  staffUsers,
  users,
} from "@rootmail/db";
import { aiCreditsForOrg, planForOrg, refreshPlanCache } from "../src/lib/plans";
import { getStripe } from "../src/lib/stripe";

const API = "http://localhost:4000";
const TAG = `cptest+${Date.now()}`;

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

  const orgId = newId("organization");
  const staffId = newId("staffUser");
  const leadId = newId("lead");
  const userId = newId("user");
  // A throwaway support staff user is created mid-test; declared here so the
  // finally always cleans it up even if a later step throws.
  let supportId: string | undefined;

  try {
    await db.insert(organizations).values({ id: orgId, name: "Custom Co", slug: TAG, plan: "free" });
    // An owner with an email, so send-invoice billing can be provisioned.
    await db.insert(users).values({ id: userId, email: `${TAG}.owner@example.com`, name: "Owner" });
    await db.insert(memberships).values({ id: newId("membership"), userId, organizationId: orgId, role: "owner" });
    await db.insert(staffUsers).values({
      id: staffId,
      email: `${TAG}@example.com`,
      name: "CP Test",
      passwordHash: hashPassword("cp-test-pw-123"),
      role: "superadmin",
    });
    await db.insert(leads).values({
      id: leadId,
      name: "Ada Lovelace",
      email: `${TAG}.lead@example.com`,
      company: "Custom Co",
      status: "qualified",
    });

    const login = await json(
      await fetch(`${API}/v1/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${TAG}@example.com`, password: "cp-test-pw-123" }),
      }),
    );
    const token = login.session_token as string | undefined;
    check(!!token, "staff login returns a token");
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Create the custom plan, converting the lead.
    const create = await fetch(`${API}/v1/admin/orgs/${orgId}/custom-plan`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        name: "Custom Co Enterprise",
        price_cents: 200_000,
        interval: "year",
        monthly_quota: 5_000_000,
        allow_overage: true,
        overage_per_1000_cents: 40,
        included_sub_tenants: 50,
        seats: 25,
        ai_credits: 1000,
        lead_id: leadId,
      }),
    });
    check(create.status === 200, `POST custom-plan → 200 (got ${create.status})`);
    const created = (await create.json()) as Record<string, unknown>;
    check(created.name === "Custom Co Enterprise" && created.monthly_quota === 5_000_000, "returns the new plan");

    // DB: row exists, org on enterprise, lead converted.
    const [cp] = await db.select().from(customPlans).where(eq(customPlans.organizationId, orgId)).limit(1);
    check(!!cp && cp.active, "custom_plans row created + active");
    const [org1] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    check(org1?.plan === "enterprise", "org moved to the enterprise tier");
    check(org1?.billingInterval === "year", "org billing interval set to yearly");
    const [lead1] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    check(lead1?.status === "won" && lead1?.organizationId === orgId, "lead converted → won + linked to org");
    const notes = await db.select().from(leadNotes).where(eq(leadNotes.leadId, leadId));
    check(notes.some((n) => n.kind === "system" && n.body.includes("Converted")), "conversion logged on the lead");

    // ENFORCEMENT — the resolver returns the custom economics, enterprise features.
    await refreshPlanCache();
    const resolverOrg = { id: orgId, plan: "enterprise" as const };
    const def = planForOrg(resolverOrg);
    check(def.monthlyQuota === 5_000_000, "resolver enforces custom quota (5,000,000)");
    check(def.seats === 25, "resolver enforces custom seats (25)");
    check(def.overagePer1000 === 0.4, "resolver enforces custom overage ($0.40/1k)");
    check(def.includedSubTenants === 50, "resolver enforces custom sub-tenants (50)");
    check(def.features.includes("sso") && def.features.includes("proof"), "inherits enterprise feature unlocks");
    check((await aiCreditsForOrg(resolverOrg)) === 1000, "resolver enforces custom AI credits (1000)");

    // Org detail surfaces the custom plan.
    const detail = await json(await fetch(`${API}/v1/admin/orgs/${orgId}`, { headers: H }));
    const detailCp = detail.custom_plan as Record<string, unknown> | null;
    check(!!detailCp && detailCp.seats === 25, "org detail includes the custom plan");

    // Re-save = upsert (one row per org), update a value.
    const update = await fetch(`${API}/v1/admin/orgs/${orgId}/custom-plan`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        name: "Custom Co Enterprise",
        price_cents: 200_000,
        interval: "year",
        monthly_quota: 8_000_000,
        allow_overage: true,
        overage_per_1000_cents: 40,
        included_sub_tenants: 50,
        seats: 30,
        ai_credits: 1000,
      }),
    });
    check(update.status === 200, "re-save → 200 (upsert)");
    const cpRows = await db.select().from(customPlans).where(eq(customPlans.organizationId, orgId));
    check(cpRows.length === 1, "still exactly one custom plan for the org");
    await refreshPlanCache();
    check(planForOrg(resolverOrg).seats === 30, "resolver picks up the updated seats (30)");

    // Bill: in Stripe mode this provisions a real (test-mode) send-invoice
    // subscription; in local mode it's reported as unavailable.
    const stripeOn = !!getStripe();
    let billedSubId: string | undefined;
    const bill = await fetch(`${API}/v1/admin/orgs/${orgId}/custom-plan/bill`, {
      method: "POST",
      headers: H,
      body: "{}",
    });
    if (stripeOn) {
      const billBody = (await bill.json()) as Record<string, unknown>;
      check(bill.status === 200 && billBody.provisioned === true, `bill → 200 + provisioned (got ${bill.status})`);
      check(typeof billBody.subscription_id === "string", "bill returns a subscription id");
      billedSubId = billBody.subscription_id as string;
      const [orgBilled] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      check(orgBilled?.stripeSubscriptionId === billedSubId, "org references the custom subscription after billing");
    } else {
      check(bill.status === 400, `bill without Stripe → 400 (got ${bill.status})`);
    }

    // Deactivate → org reverts to the standard enterprise economics, and (in Stripe
    // mode) the bespoke subscription is canceled + detached so billing matches.
    const deact = await fetch(`${API}/v1/admin/orgs/${orgId}/custom-plan/deactivate`, {
      method: "POST",
      headers: H,
      body: "{}",
    });
    check(deact.status === 200, `deactivate → 200 (got ${deact.status})`);
    const deactBody = (await deact.json()) as Record<string, unknown>;
    await refreshPlanCache();
    check(planForOrg(resolverOrg).monthlyQuota === 1_000_000, "after deactivate, resolver falls back to enterprise quota (1,000,000)");
    check((await aiCreditsForOrg(resolverOrg)) === -1, "after deactivate, AI credits fall back to enterprise (unlimited)");

    // Billing is made consistent with the reverted economics: the org stays on the
    // enterprise tier, and the custom subscription is canceled in Stripe + detached.
    const [orgAfter] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    check(orgAfter?.plan === "enterprise", "after deactivate, org stays on the enterprise tier");
    if (stripeOn) {
      check(deactBody.billing === "canceled", `deactivate cancels the custom subscription (billing=${deactBody.billing})`);
      check(orgAfter?.stripeSubscriptionId === null, "after deactivate, org subscription id is cleared");
      check(orgAfter?.planStatus === "active", "after deactivate, plan status reverts to active");
      if (billedSubId) {
        const sub = await getStripe()!.subscriptions.retrieve(billedSubId);
        check(sub.status === "canceled", `the custom subscription is canceled in Stripe (status=${sub.status})`);
      }
    } else {
      check(deactBody.billing === "skipped", `deactivate without Stripe → billing skipped (got ${deactBody.billing})`);
    }

    // Non-superadmin can't create one.
    supportId = newId("staffUser");
    await db.insert(staffUsers).values({
      id: supportId,
      email: `${TAG}.support@example.com`,
      name: "Support",
      passwordHash: hashPassword("cp-test-pw-123"),
      role: "support",
    });
    const supLogin = await json(
      await fetch(`${API}/v1/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${TAG}.support@example.com`, password: "cp-test-pw-123" }),
      }),
    );
    const forbidden = await fetch(`${API}/v1/admin/orgs/${orgId}/custom-plan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supLogin.session_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", price_cents: 1, monthly_quota: 1 }),
    });
    check(forbidden.status === 403, `support role blocked from custom-plan → 403 (got ${forbidden.status})`);
  } finally {
    // Stripe test-mode cleanup: archive the synced price/product, cancel any
    // subscription, and delete the customer the test created.
    const stripe = getStripe();
    if (stripe) {
      const [cpRow] = await db.select().from(customPlans).where(eq(customPlans.organizationId, orgId));
      const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, orgId));
      if (orgRow?.stripeSubscriptionId)
        await stripe.subscriptions.cancel(orgRow.stripeSubscriptionId).catch(() => {});
      if (cpRow?.stripePriceId) await stripe.prices.update(cpRow.stripePriceId, { active: false }).catch(() => {});
      if (cpRow?.stripeProductId)
        await stripe.products.update(cpRow.stripeProductId, { active: false }).catch(() => {});
      if (orgRow?.stripeCustomerId) await stripe.customers.del(orgRow.stripeCustomerId).catch(() => {});
    }
    await db.delete(organizations).where(eq(organizations.id, orgId)); // cascades memberships + custom_plans
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(leads).where(eq(leads.id, leadId)); // cascades notes
    await db.delete(staffUsers).where(eq(staffUsers.id, staffId));
    if (supportId) await db.delete(staffUsers).where(eq(staffUsers.id, supportId)).catch(() => {});
  }

  console.log(pass ? "\nAll custom-plan checks passed." : "\nSome checks FAILED.");
  await closeDb();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
