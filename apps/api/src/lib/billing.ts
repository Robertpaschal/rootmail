import { and, eq, sql } from "drizzle-orm";
import { Errors, newId, PLANS, type PlanDef } from "@rootmail/core";
import { db, type Organization, usageRecords } from "@rootmail/db";

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

/**
 * Gate a live send. Plans that allow overage are never blocked (they bill the
 * excess); hard-capped plans (Free) throw 402 once the quota is reached.
 */
export async function assertCanSend(org: Organization): Promise<void> {
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
