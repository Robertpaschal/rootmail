import { and, eq, inArray, like, sql } from "drizzle-orm";
import { env } from "@rootmail/core";
import { betaAddressOrgId, betaSenderDomain, campaigns, db, senderIdentities, workspaces } from "@rootmail/db";

/**
 * Moves beta sender addresses from the legacy apex form (beta+<org>@rootmail.io)
 * to the current beta domain (beta+<org>@reply.rootmail.io, see
 * betaSenderDomain). Dry run unless `apply` is set; re-running is a no-op.
 *
 * What moves, per address:
 *  - the sender_identities row's email, in place (same id, default flag and
 *    verification), so the org has ONE beta address, not two;
 *  - from_email on that org's draft and scheduled campaigns that use it.
 * What deliberately does not move:
 *  - messages / thread_messages: history, and queued or scheduled messages
 *    still send — the apex form stays an accepted From for its own org;
 *  - threads: reply+<thread> tokens and In-Reply-To/References still match, and
 *    mail that ever arrives for the apex form is still accepted.
 * A row whose target address already exists is skipped and reported.
 */
export type BetaMigrationStatus = "would_migrate" | "migrated" | "skipped_conflict";
export interface BetaMigrationRow {
  sender_id: string;
  organization_id: string;
  from: string;
  to: string;
  is_default: boolean;
  campaigns: number;
  status: BetaMigrationStatus;
}
export interface BetaMigrationReport {
  apply: boolean;
  beta_domain: string;
  legacy_domain: string;
  /** Set when there is nothing to do because the beta domain IS the apex. */
  noop_reason: string | null;
  rows: BetaMigrationRow[];
}

const PENDING_CAMPAIGN = ["draft", "scheduled"] as const;

export async function migrateBetaSenders(opts: { apply: boolean }): Promise<BetaMigrationReport> {
  const legacyDomain = env.ROOTMAIL_DOMAIN.trim().toLowerCase();
  const betaDomain = betaSenderDomain();
  const report: BetaMigrationReport = { apply: opts.apply, beta_domain: betaDomain, legacy_domain: legacyDomain, noop_reason: null, rows: [] };
  if (betaDomain === legacyDomain) {
    report.noop_reason = `INBOUND_DOMAIN is not a subdomain of ${legacyDomain}; beta addresses stay on the apex.`;
    return report;
  }

  const legacy = await db
    .select()
    .from(senderIdentities)
    .where(like(sql`lower(${senderIdentities.email})`, `beta+%@${legacyDomain}`));

  for (const s of legacy) {
    const orgId = betaAddressOrgId(s.email);
    if (!orgId) continue; // not a well-formed platform beta address
    const from = s.email.trim().toLowerCase();
    const to = `${from.slice(0, from.lastIndexOf("@"))}@${betaDomain}`;
    const wsIds = (await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, s.organizationId))).map((w) => w.id);
    const campaignWhere = wsIds.length
      ? and(inArray(campaigns.workspaceId, wsIds), inArray(campaigns.status, [...PENDING_CAMPAIGN]), eq(sql`lower(${campaigns.fromEmail})`, from))
      : undefined;
    const campaignCount = campaignWhere
      ? Number((await db.select({ n: sql<number>`count(*)` }).from(campaigns).where(campaignWhere))[0]?.n ?? 0)
      : 0;
    const [clash] = await db.select({ id: senderIdentities.id }).from(senderIdentities).where(eq(senderIdentities.email, to)).limit(1);
    const row: BetaMigrationRow = {
      sender_id: s.id, organization_id: s.organizationId, from, to, is_default: s.isDefault, campaigns: campaignCount,
      status: clash ? "skipped_conflict" : opts.apply ? "migrated" : "would_migrate",
    };
    if (!clash && opts.apply) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`beta-sender:${s.organizationId}`}, 0))`);
        await tx.update(senderIdentities).set({ email: to }).where(eq(senderIdentities.id, s.id));
        if (campaignWhere) await tx.update(campaigns).set({ fromEmail: to, updatedAt: new Date() }).where(campaignWhere);
      });
    }
    report.rows.push(row);
  }
  return report;
}
