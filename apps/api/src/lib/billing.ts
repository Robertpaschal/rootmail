import { and, eq, inArray, sql } from "drizzle-orm";
import { Errors, newId, type PlanDef } from "@rootmail/core";
import {
  db,
  listContacts,
  lists,
  marketingDailyUsage,
  memberships,
  type Organization,
  usageRecords,
  users,
  workspaces,
} from "@rootmail/db";
import { planForOrg } from "./plans";
import {
  contactLimitForOrg,
  marketingDailyLimitForOrg,
  marketingSendAllowanceForOrg,
  mkTierFor,
  type WingOrg,
} from "./wings";

/** The org fields the pricing resolvers need — always the wing columns now. */
export type BillableOrg = WingOrg & { id: string };

export function planFor(org: BillableOrg): PlanDef {
  return planForOrg(org);
}

/** Which meter a message type feeds: transactional sends consume BLOCKS; marketing
 * and sales volume is covered by the CONTACT-priced marketing wing. */
export type SendKind = "transactional" | "marketing";
export function sendKindOf(type: string): SendKind {
  return type === "marketing" || type === "sales" ? "marketing" : "transactional";
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

/** Atomically add to this month's send counter (upsert). Transactional sends feed
 * the block meter (`emailsSent`); marketing/sales feed the informational
 * `marketingSent` counter — they are never billed against blocks. */
export async function recordSend(
  organizationId: string,
  n = 1,
  kind: SendKind = "transactional",
): Promise<void> {
  const period = currentPeriod();
  if (kind === "marketing") {
    await db
      .insert(usageRecords)
      .values({ id: newId("usage"), organizationId, period, marketingSent: n })
      .onConflictDoUpdate({
        target: [usageRecords.organizationId, usageRecords.period],
        set: { marketingSent: sql`${usageRecords.marketingSent} + ${n}`, updatedAt: new Date() },
      });
    return;
  }
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, emailsSent: n })
    .onConflictDoUpdate({
      target: [usageRecords.organizationId, usageRecords.period],
      set: { emailsSent: sql`${usageRecords.emailsSent} + ${n}`, updatedAt: new Date() },
    });
}

/** Marketing/sales sends this calendar month (metered against the contact-scaled
 * monthly allowance). */
export async function getMarketingUsage(
  organizationId: string,
  period = currentPeriod(),
): Promise<number> {
  const [row] = await db
    .select({ n: usageRecords.marketingSent })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.period, period)))
    .limit(1);
  return row?.n ?? 0;
}

/** UTC day key "YYYY-MM-DD" for the per-day marketing cap. */
export function currentDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Marketing sends TODAY (against the contact-scaled daily cap). */
export async function getMarketingDaily(organizationId: string, day = currentDay()): Promise<number> {
  const [row] = await db
    .select({ n: marketingDailyUsage.sent })
    .from(marketingDailyUsage)
    .where(and(eq(marketingDailyUsage.organizationId, organizationId), eq(marketingDailyUsage.day, day)))
    .limit(1);
  return row?.n ?? 0;
}

/** Record `n` marketing sends against BOTH the monthly and the daily counters
 * (bulk campaign/sequence path — capacity is asserted up front, this just meters). */
export async function recordMarketingSend(organizationId: string, n = 1): Promise<void> {
  const period = currentPeriod();
  const day = currentDay();
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, marketingSent: n })
    .onConflictDoUpdate({
      target: [usageRecords.organizationId, usageRecords.period],
      set: { marketingSent: sql`${usageRecords.marketingSent} + ${n}`, updatedAt: new Date() },
    });
  await db
    .insert(marketingDailyUsage)
    .values({ id: newId("usage"), organizationId, day, sent: n })
    .onConflictDoUpdate({
      target: [marketingDailyUsage.organizationId, marketingDailyUsage.day],
      set: { sent: sql`${marketingDailyUsage.sent} + ${n}`, updatedAt: new Date() },
    });
}

/**
 * Atomically reserve ONE marketing send against BOTH the monthly and the daily
 * cap (the API single-send path). Both caps scale with the chosen contact size ×
 * the tier's multipliers. Returns false (nothing consumed) if either cap is hit.
 */
export async function tryConsumeMarketing(org: BillableOrg, n = 1): Promise<boolean> {
  const monthly = marketingSendAllowanceForOrg(org);
  const daily = marketingDailyLimitForOrg(org);
  const period = currentPeriod();
  const day = currentDay();

  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId: org.id, period, marketingSent: 0 })
    .onConflictDoNothing({ target: [usageRecords.organizationId, usageRecords.period] });
  const m = await db
    .update(usageRecords)
    .set({ marketingSent: sql`${usageRecords.marketingSent} + ${n}`, updatedAt: new Date() })
    .where(
      and(
        eq(usageRecords.organizationId, org.id),
        eq(usageRecords.period, period),
        sql`${usageRecords.marketingSent} + ${n} <= ${monthly}`,
      ),
    )
    .returning({ id: usageRecords.id });
  if (m.length === 0) return false;

  await db
    .insert(marketingDailyUsage)
    .values({ id: newId("usage"), organizationId: org.id, day, sent: 0 })
    .onConflictDoNothing({ target: [marketingDailyUsage.organizationId, marketingDailyUsage.day] });
  const d = await db
    .update(marketingDailyUsage)
    .set({ sent: sql`${marketingDailyUsage.sent} + ${n}`, updatedAt: new Date() })
    .where(
      and(
        eq(marketingDailyUsage.organizationId, org.id),
        eq(marketingDailyUsage.day, day),
        sql`${marketingDailyUsage.sent} + ${n} <= ${daily}`,
      ),
    )
    .returning({ id: marketingDailyUsage.id });
  if (d.length === 0) {
    // Daily cap hit → give the monthly reservation back.
    await db
      .update(usageRecords)
      .set({ marketingSent: sql`${usageRecords.marketingSent} - ${n}`, updatedAt: new Date() })
      .where(and(eq(usageRecords.organizationId, org.id), eq(usageRecords.period, period)));
    return false;
  }
  return true;
}

/**
 * Assert the org can send `n` marketing emails now — enough monthly allowance AND
 * daily headroom (the bulk campaign/sequence path checks the batch up front, then
 * meters via recordMarketingSend). 402 with the marketing-wing upgrade otherwise.
 */
export async function assertMarketingSendCapacity(org: BillableOrg, n: number): Promise<void> {
  if (n <= 0) return;
  const monthly = marketingSendAllowanceForOrg(org);
  const daily = marketingDailyLimitForOrg(org);
  const [used, usedToday] = await Promise.all([getMarketingUsage(org.id), getMarketingDaily(org.id)]);
  const tier = mkTierFor(org);
  if (used + n > monthly) {
    throw Errors.quotaExceeded(
      `This send needs ${n.toLocaleString()} marketing emails but only ${(monthly - used).toLocaleString()} of your ${monthly.toLocaleString()}/mo allowance is left on Marketing ${tier.name}. Grow your contact size or upgrade the Marketing wing.`,
      { marketing_used: used, marketing_allowance: monthly, wing: "marketing", upgrade_url: "/billing/marketing" },
    );
  }
  if (usedToday + n > daily) {
    throw Errors.quotaExceeded(
      `This send needs ${n.toLocaleString()} marketing emails but your daily cap on Marketing ${tier.name} is ${daily.toLocaleString()}/day (${(daily - usedToday).toLocaleString()} left today). It resets tomorrow, or grow your contact size.`,
      { marketing_daily_used: usedToday, marketing_daily_limit: daily, wing: "marketing", upgrade_url: "/billing/marketing" },
    );
  }
}

/**
 * Billable contacts for an org — audience memberships across all its workspaces
 * (a contact in three audiences counts three times; PRICING-WINGS-SPEC §3b). This
 * is the number the marketing wing prices.
 */
export async function billableContacts(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listContacts)
    .innerJoin(lists, eq(lists.id, listContacts.listId))
    .innerJoin(workspaces, eq(workspaces.id, lists.workspaceId))
    .where(eq(workspaces.organizationId, organizationId));
  return row?.n ?? 0;
}

/**
 * Gate audience GROWTH on the marketing tier's contact bracket: adding `adding`
 * memberships must stay within the bracket, else 402 with the marketing-wing
 * upgrade. Existing contacts keep working — only growth is blocked.
 */
export async function assertContactCapacity(org: BillableOrg, adding = 1): Promise<void> {
  const limit = contactLimitForOrg(org);
  if (limit === -1) return; // unlimited
  const current = await billableContacts(org.id);
  if (current + adding > limit) {
    const tier = mkTierFor(org);
    throw Errors.quotaExceeded(
      `Your audience is at ${current.toLocaleString()} of ${limit.toLocaleString()} contacts on Marketing ${tier.name}. Upgrade the Marketing wing to grow it.`,
      { contacts: current, limit, wing: "marketing", upgrade_url: "/billing/marketing" },
    );
  }
}

/**
 * Atomically reserve one TRANSACTIONAL send against the block allowance. Block
 * customers always succeed (excess bills as overage); the Free allowance is a hard
 * cap — the check and the increment happen in a single statement, so a burst of
 * concurrent sends can't overshoot. Marketing sends never come through here.
 */
export async function tryConsumeQuota(org: BillableOrg, n = 1): Promise<boolean> {
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

/**
 * Atomically reserve ONE AI credit against the monthly allowance — closing the
 * read-then-record race in the assistant (two concurrent requests at the cap could
 * both pass a separate read-then-check). Unlimited (allowance -1) isn't metered and
 * always succeeds. Otherwise it increments aiCreditsUsed only if it stays within
 * allowance, in a single conditional UPDATE. Returns the new used count on success,
 * or null when already at the cap. The caller reconciles the real model-call count
 * afterward with recordAiUse() (the run costs ≥1; extra steps are added post-hoc).
 */
export async function tryConsumeAiCredit(
  organizationId: string,
  allowance: number,
): Promise<number | null> {
  if (allowance === -1) return -1; // unlimited — not metered
  const period = currentPeriod();
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, aiCreditsUsed: 0 })
    .onConflictDoNothing({ target: [usageRecords.organizationId, usageRecords.period] });
  const updated = await db
    .update(usageRecords)
    .set({ aiCreditsUsed: sql`${usageRecords.aiCreditsUsed} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        eq(usageRecords.period, period),
        sql`${usageRecords.aiCreditsUsed} + 1 <= ${allowance}`,
      ),
    )
    .returning({ n: usageRecords.aiCreditsUsed });
  return updated.length > 0 ? updated[0].n : null;
}

/** Atomically add to this month's AI-credit counter (upsert). Accepts a negative
 * `n` to refund (e.g. reconciling a reserved credit against a keyless/failed run). */
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

/** Overage units (1 unit = 1,000 emails) already reported to Stripe this period. */
export async function getReportedOverage(
  organizationId: string,
  period = currentPeriod(),
): Promise<number> {
  const [row] = await db
    .select({ n: usageRecords.overageReportedUnits })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.period, period)))
    .limit(1);
  return row?.n ?? 0;
}

/** Persist the running total of overage units reported to Stripe this period. */
export async function setReportedOverage(
  organizationId: string,
  units: number,
  period = currentPeriod(),
): Promise<void> {
  await db
    .insert(usageRecords)
    .values({ id: newId("usage"), organizationId, period, overageReportedUnits: units })
    .onConflictDoUpdate({
      target: [usageRecords.organizationId, usageRecords.period],
      set: { overageReportedUnits: units, updatedAt: new Date() },
    });
}

export interface QuotaState {
  plan: PlanDef;
  /** Transactional sends this period (the block meter). */
  used: number;
  quota: number;
  remaining: number;
  overage: number;
  overage_cost: number;
  over_limit: boolean;
  /** Marketing sends this period vs the contact-scaled monthly allowance. */
  marketing_sent: number;
  marketing_allowance: number;
  marketing_sent_today: number;
  marketing_daily_limit: number;
  /** Billable contacts (audience memberships) vs the chosen contact size. */
  contacts_used: number;
  contacts_limit: number;
}

export async function quotaState(org: Organization): Promise<QuotaState> {
  const plan = planFor(org);
  const [used, marketingSent, marketingToday, contactsUsed] = await Promise.all([
    getUsage(org.id),
    getMarketingUsage(org.id),
    getMarketingDaily(org.id),
    billableContacts(org.id),
  ]);
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
    marketing_sent: marketingSent,
    marketing_allowance: marketingSendAllowanceForOrg(org),
    marketing_sent_today: marketingToday,
    marketing_daily_limit: marketingDailyLimitForOrg(org),
    contacts_used: contactsUsed,
    contacts_limit: contactLimitForOrg(org),
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
 * Gate a live TRANSACTIONAL send: email verification first (anti-abuse), then the
 * block allowance. Block customers are never volume-blocked (excess bills as
 * overage); the Free allowance throws 402 once reached — buy send blocks to scale.
 */
export async function assertCanSend(org: Organization): Promise<void> {
  await assertEmailVerified(org);
  const plan = planFor(org);
  if (plan.allowOverage) return;
  const used = await getUsage(org.id);
  if (used >= plan.monthlyQuota) {
    throw Errors.quotaExceeded(
      `You've used your free ${plan.monthlyQuota.toLocaleString()} transactional emails this month. Buy send blocks (25,000 emails each) to keep sending.`,
      { quota: plan.monthlyQuota, wing: "transactional", upgrade_url: "/billing/transactional" },
    );
  }
}
