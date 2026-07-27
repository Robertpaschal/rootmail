import { and, eq } from "drizzle-orm";
import {
  BLOCK_SIZE,
  FREE_MK_CONTACTS,
  getTierDef,
  marketingDailyLimit,
  marketingSendAllowance,
  type TierDef,
  txDailyLimit,
} from "@rootmail/core";
import {
  db,
  marketingDailyUsage,
  organizations,
  transactionalDailyUsage,
  usageRecords,
} from "@rootmail/db";

// Send capacity, as the WORKER sees it. The API asserts capacity at the entry
// point (a campaign reserves its whole batch up front), but a sequence drips for
// days — its capacity has to be re-checked at each step, long after enrollment.
//
// The rule this exists to serve: a step that can't send right now is DEFERRED,
// never dropped. We return when to try again so the drip resumes on its own.
// (Mirrors apps/api/src/lib/billing.ts — see the note in send.ts about a future
// shared @rootmail/messaging package.)

export interface CapacityVerdict {
  ok: boolean;
  /** When to retry (only when !ok) — the moment the blocking cap resets. */
  retryAt?: Date;
  /** Plain-English reason, for the worker log and any future surfacing. */
  reason?: string;
}

const period = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const day = (d = new Date()) => d.toISOString().slice(0, 10);

/** Next UTC midnight — when both daily caps reset. */
function nextUtcMidnight(): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 0, 5, 0));
}
/** First minute of next UTC month — when the monthly allowances reset. */
function nextUtcMonth(): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1, 0, 5, 0));
}

function tierOr(id: string | null, fallback: string): TierDef | undefined {
  return getTierDef(id ?? fallback) ?? getTierDef(fallback);
}

/**
 * Can this org send ONE more email of `type` right now? Checks the monthly
 * allowance and the per-day burst cap for the matching wing.
 */
export async function checkSendCapacity(
  organizationId: string,
  type: string,
): Promise<CapacityVerdict> {
  const [org] = await db
    .select({
      transactionalTier: organizations.transactionalTier,
      transactionalBlocks: organizations.transactionalBlocks,
      marketingTier: organizations.marketingTier,
      marketingContacts: organizations.marketingContacts,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return { ok: true }; // no org row → nothing to meter against

  const [usage] = await db
    .select({ sent: usageRecords.emailsSent, marketing: usageRecords.marketingSent })
    .from(usageRecords)
    .where(and(eq(usageRecords.organizationId, organizationId), eq(usageRecords.period, period())))
    .limit(1);

  const isMarketing = type === "marketing" || type === "sales";

  if (isMarketing) {
    const tier = tierOr(org.marketingTier, "mk_free");
    if (!tier) return { ok: true };
    const contacts = Math.max(org.marketingContacts ?? 0, tier.id === "mk_free" ? FREE_MK_CONTACTS : 0);
    const monthly = marketingSendAllowance(tier, contacts);
    const daily = marketingDailyLimit(tier, contacts);
    const usedMonth = usage?.marketing ?? 0;
    if (monthly > 0 && usedMonth >= monthly) {
      return {
        ok: false,
        retryAt: nextUtcMonth(),
        reason: `marketing allowance spent (${usedMonth}/${monthly} this month)`,
      };
    }
    const [d] = await db
      .select({ n: marketingDailyUsage.sent })
      .from(marketingDailyUsage)
      .where(
        and(
          eq(marketingDailyUsage.organizationId, organizationId),
          eq(marketingDailyUsage.day, day()),
        ),
      )
      .limit(1);
    const usedToday = d?.n ?? 0;
    if (daily > 0 && usedToday >= daily) {
      return {
        ok: false,
        retryAt: nextUtcMidnight(),
        reason: `marketing daily cap reached (${usedToday}/${daily} today)`,
      };
    }
    return { ok: true };
  }

  // Transactional: blocks × BLOCK_SIZE (or the Free allowance) + the daily cap.
  const tier = tierOr(org.transactionalTier, "tx_free");
  if (!tier) return { ok: true };
  const blocks = org.transactionalBlocks ?? 0;
  const monthly =
    tier.includedSends === -1
      ? Number.MAX_SAFE_INTEGER
      : blocks > 0
        ? blocks * (tier.blockSize ?? BLOCK_SIZE)
        : (tier.includedSends ?? 0);
  const usedMonth = usage?.sent ?? 0;
  // Block customers bill overage rather than stop, so only a hard (Free) cap blocks.
  if (!tier.allowOverage && usedMonth >= monthly) {
    return {
      ok: false,
      retryAt: nextUtcMonth(),
      reason: `transactional allowance spent (${usedMonth}/${monthly} this month)`,
    };
  }
  const daily = txDailyLimit(tier, blocks);
  if (daily > 0) {
    const [d] = await db
      .select({ n: transactionalDailyUsage.sent })
      .from(transactionalDailyUsage)
      .where(
        and(
          eq(transactionalDailyUsage.organizationId, organizationId),
          eq(transactionalDailyUsage.day, day()),
        ),
      )
      .limit(1);
    const usedToday = d?.n ?? 0;
    if (usedToday >= daily) {
      return {
        ok: false,
        retryAt: nextUtcMidnight(),
        reason: `transactional daily cap reached (${usedToday}/${daily} today)`,
      };
    }
  }
  return { ok: true };
}
