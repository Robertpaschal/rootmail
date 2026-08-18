import { and, eq, gte, sql } from "drizzle-orm";
import {
  MESSAGE_STATUSES,
  type MessageStatus,
  REPUTATION_WINDOW_DAYS,
  type ReputationSample,
  sampleFromCounts,
  SUPPRESSION_REASONS,
  type SuppressionReason,
} from "@rootmail/core";
import { db } from "./client";
import { realSendsOnly } from "./real-sends";
import { messages, subTenants, suppressions } from "./schema";

// Gathering the numbers a tenant is judged on. Shared because the READ path
// (GET /v1/deliverability) and the ENFORCEMENT path (the worker's reputation
// sweep) must count the same things — if the dashboard says a client is fine
// while the sweep pauses them, the feature is worse than not having it.

export interface OutcomeCounts extends Record<MessageStatus, number> {}

export interface ReputationSnapshotInput {
  windowDays: number;
  counts: OutcomeCounts;
  suppressions: { total: number; byReason: Record<SuppressionReason, number> };
  domains: { total: number; verified: number; unverified: number };
}

export interface CountOptions {
  workspaceId: string;
  subTenantId?: string | null;
  windowDays?: number;
  /** Ignore anything before this — used to judge a resumed tenant on new mail only. */
  since?: Date | null;
  /**
   * Drop sandbox sends.
   *
   * The read path counts them (a sandbox workspace's dashboard should describe
   * the sandbox), but ENFORCEMENT must not: sandbox outcomes are simulated, and
   * the product ships bounce and complaint test scenarios that it actively
   * invites you to run. Pausing a real client because their developer exercised
   * the bounce scenario would be indefensible.
   */
  realSendsOnly?: boolean;
}

/** Message outcomes for a tenant in the window, grouped by status. */
export async function outcomeCounts(opts: CountOptions): Promise<OutcomeCounts> {
  const windowDays = opts.windowDays ?? REPUTATION_WINDOW_DAYS;
  const windowStart = new Date(Date.now() - windowDays * 86_400_000);
  // A resume moves the goalposts forward, never backwards.
  const since = opts.since && opts.since > windowStart ? opts.since : windowStart;

  const conds = [
    eq(messages.workspaceId, opts.workspaceId),
    gte(messages.createdAt, since),
    // Test-recipient mail never counts anywhere — see real-sends.ts.
    ...realSendsOnly(),
  ];
  if (opts.subTenantId) conds.push(eq(messages.subTenantId, opts.subTenantId));
  if (opts.realSendsOnly) conds.push(eq(messages.sandbox, false));

  const rows = await db
    .select({ status: messages.status, n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(...conds))
    .groupBy(messages.status);

  const counts = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as OutcomeCounts;
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Active suppressions for a tenant, grouped by reason (cumulative, not windowed). */
export async function suppressionCounts(
  workspaceId: string,
  subTenantId?: string | null,
): Promise<{ total: number; byReason: Record<SuppressionReason, number> }> {
  const conds = [eq(suppressions.workspaceId, workspaceId)];
  if (subTenantId) conds.push(eq(suppressions.subTenantId, subTenantId));
  const rows = await db
    .select({ reason: suppressions.reason, n: sql<number>`count(*)::int` })
    .from(suppressions)
    .where(and(...conds))
    .groupBy(suppressions.reason);

  const byReason = Object.fromEntries(
    SUPPRESSION_REASONS.map((r) => [r, 0]),
  ) as Record<SuppressionReason, number>;
  let total = 0;
  for (const r of rows) {
    byReason[r.reason] = r.n;
    total += r.n;
  }
  return { total, byReason };
}

/** Sending-domain auth health (sub-tenant DKIM verification). */
export async function domainHealth(
  workspaceId: string,
  subTenantId?: string | null,
): Promise<{ total: number; verified: number; unverified: number }> {
  const conds = [eq(subTenants.workspaceId, workspaceId)];
  if (subTenantId) conds.push(eq(subTenants.id, subTenantId));
  const rows = await db.select({ status: subTenants.status }).from(subTenants).where(and(...conds));
  const total = rows.length;
  const verified = rows.filter((d) => d.status === "verified").length;
  return { total, verified, unverified: total - verified };
}

/** Everything computeDeliverability needs, for one workspace or one tenant. */
export async function reputationSnapshotInput(
  opts: CountOptions,
): Promise<ReputationSnapshotInput> {
  const [counts, sup, domains] = await Promise.all([
    outcomeCounts(opts),
    suppressionCounts(opts.workspaceId, opts.subTenantId),
    domainHealth(opts.workspaceId, opts.subTenantId),
  ]);
  return {
    windowDays: opts.windowDays ?? REPUTATION_WINDOW_DAYS,
    counts,
    suppressions: sup,
    domains,
  };
}

/** The three rates the enforcement state machine runs on. */
export function sampleFromOutcomes(counts: OutcomeCounts): ReputationSample {
  return sampleFromCounts({
    delivered: counts.delivered ?? 0,
    bounced: counts.bounced ?? 0,
    complained: counts.complained ?? 0,
  });
}
