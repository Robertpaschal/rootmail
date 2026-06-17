import { and, eq, sql } from "drizzle-orm";
import { Errors, newId, PLANS, type PlanDef } from "@rootmail/core";
import { db, memberships, type Organization, usageRecords, users } from "@rootmail/db";

export function planFor(org: Pick<Organization, "plan">): PlanDef {
  return PLANS[org.plan] ?? PLANS.free;
}

/** Calendar-month period key in UTC, e.g. "2026-06". */
export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(organizationId: string, period = currentPeriod()): Promise<number> {
  const [row] = await db
    .select({ n: usageRecords.emailsSent })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.period, period)))
    .limit(1);
  return row?.n ?? 0;
}

/** Atomically add to this month's send counter (upsert). */
export async function recordSend(organizationId: string, n = 1): Promise<void> {
  const period = currentPeriod();
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, emailsSent: n })
    .onConflictDoUpdate({
      target: [usageRecords.organizationId, usageRecords.period],
      set: { emailsSent: sql`${usageRecords.emailsSent} + ${n}`, updatedAt: new Date() },
    });
}

/**
 * Atomically reserve one send against the monthly quota. Overage plans always
 * succeed (they bill the excess); hard-capped plans (Free) only succeed while
 * under the cap — the check and the increment happen in a single statement, so
 * a burst of concurrent sends can't overshoot the limit (closes the
 * read-then-write race in `assertCanSend` + `recordSend`). Returns false when a
 * hard-capped plan is already at its limit.
 */
export async function tryConsumeQuota(
  org: Pick<Organization, "id" | "plan">,
  n = 1,
): Promise<boolean> {
  const plan = planFor(org);
  if (plan.allowOverage) {
    await recordSend(org.id, n);
    return true;
  }
  const period = currentPeriod();
  // Ensure the counter row exists, then increment only if it stays within cap.
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId: org.id, period, emailsSent: 0 })
    .onConflictDoNothing({ target: [usageRecords.organizationId, usageRecords.period] });
  const updated = await db
    .update(usageRecords)
    .set({ emailsSent: sql`${usageRecords.emailsSent} + ${n}`, updatedAt: new Date() })
    .where(
      and(
        eq(usageRecords.organizationId, org.id),
        eq(usageRecords.period, period),
        sql`${usageRecords.emailsSent} + ${n} <= ${plan.monthlyQuota}`,
      ),
    )
    .returning({ id: usageRecords.id });
  return updated.length > 0;
}

/** AI template drafts used this calendar month (metered against AI credits). */
export async function getAiUsage(organizationId: string, period = currentPeriod()): Promise<number> {
  const [row] = await db
    .select({ n: usageRecords.aiCreditsUsed })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.period, period)))
    .limit(1);
  return row?.n ?? 0;
}

/** Atomically add to this month's AI-credit counter (upsert). */
export async function recordAiUse(organizationId: string, n = 1): Promise<void> {
  const period = currentPeriod();
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, aiCreditsUsed: n })
    .onConflictDoUpdate({
      target: [usageRecords.organizationId, usageRecords.period],
      set: { aiCreditsUsed: sql`${usageRecords.aiCreditsUsed} + ${n}`, updatedAt: new Date() },
    });
}

export interface QuotaState {
  plan: PlanDef;
  used: number;
  quota: number;
  remaining: number;
  overage: number;
  overage_cost: number;
  over_limit: boolean;
}

export async function quotaState(org: Organization): Promise<QuotaState> {
  const plan = planFor(org);
  const used = await getUsage(org.id);
  const overage = Math.max(0, used - plan.monthlyQuota);
  return {
    plan,
    used,
    quota: plan.monthlyQuota,
    remaining: plan.monthlyQuota - used,
    overage,
    // Overage billed per started 1,000.
    overage_cost: Math.ceil(overage / 1000) * plan.overagePer1000,
    over_limit: used >= plan.monthlyQuota,
  };
}

/** Is the org's owner a verified human? Password signups are unverified until
 * they confirm their email; OAuth signups are verified on creation. */
export async function orgOwnerVerified(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ verifiedAt: users.emailVerifiedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner")))
    .limit(1);
  // Fail-open if there's somehow no owner row, so sending never wedges.
  return row ? row.verifiedAt != null : true;
}

/** Block live sends from an org whose owner hasn't verified their email
 * (anti-abuse on fresh accounts). Applies to API-key and session sends alike;
 * test-mode sends are unaffected. */
export async function assertEmailVerified(org: Organization): Promise<void> {
  if (!(await orgOwnerVerified(org.id))) {
    throw Errors.forbidden(
      "Verify your email address before sending live email — check your inbox for the verification link.",
    );
  }
}

/**
 * Gate a live send: email verification first (anti-abuse), then volume. Plans
 * that allow overage are never volume-blocked (they bill the excess); hard-capped
 * plans (Free) throw 402 once the quota is reached.
 */
export async function assertCanSend(org: Organization): Promise<void> {
  await assertEmailVerified(org);
  const plan = planFor(org);
  if (plan.allowOverage) return;
  const used = await getUsage(org.id);
  if (used >= plan.monthlyQuota) {
    throw Errors.quotaExceeded(
      `You've reached your monthly limit of ${plan.monthlyQuota.toLocaleString()} emails. Upgrade your plan to keep sending.`,
      { quota: plan.monthlyQuota },
    );
  }
}
