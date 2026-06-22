import { and, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MESSAGE_STATUSES, type MessageStatus, SUPPRESSION_REASONS, type SuppressionReason } from "@rootmail/core";
import { db, messages, subTenants, suppressions } from "@rootmail/db";
import { computeDeliverability } from "../lib/deliverability";
import { parse } from "../lib/validate";

const query = z.object({
  window_days: z.coerce.number().int().min(1).max(90).default(30),
  sub_tenant_id: z.string().optional(),
});

export async function deliverabilityRoutes(app: FastifyInstance): Promise<void> {
  // Reputation snapshot from real send outcomes (+ domain-auth health). Read-only,
  // workspace-scoped; pass ?sub_tenant_id= to scope to one sending domain.
  app.get("/v1/deliverability", async (req) => {
    const q = parse(query, req.query);
    const wsId = req.auth.workspace.id;
    const st = q.sub_tenant_id;
    const since = new Date(Date.now() - q.window_days * 86_400_000);

    // Message outcomes in the window, grouped by status.
    const msgConds = [eq(messages.workspaceId, wsId), gte(messages.createdAt, since)];
    if (st) msgConds.push(eq(messages.subTenantId, st));
    const statusRows = await db
      .select({ status: messages.status, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(...msgConds))
      .groupBy(messages.status);
    const counts = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as Record<MessageStatus, number>;
    for (const r of statusRows) counts[r.status] = r.n;

    // Active suppressions, grouped by reason (not windowed — list health is cumulative).
    const supConds = [eq(suppressions.workspaceId, wsId)];
    if (st) supConds.push(eq(suppressions.subTenantId, st));
    const supRows = await db
      .select({ reason: suppressions.reason, n: sql<number>`count(*)::int` })
      .from(suppressions)
      .where(and(...supConds))
      .groupBy(suppressions.reason);
    const byReason = Object.fromEntries(SUPPRESSION_REASONS.map((r) => [r, 0])) as Record<SuppressionReason, number>;
    let supTotal = 0;
    for (const r of supRows) {
      byReason[r.reason] = r.n;
      supTotal += r.n;
    }

    // Sending-domain auth health (sub-tenant DKIM verification).
    const stConds = [eq(subTenants.workspaceId, wsId)];
    if (st) stConds.push(eq(subTenants.id, st));
    const domainRows = await db.select({ status: subTenants.status }).from(subTenants).where(and(...stConds));
    const dTotal = domainRows.length;
    const dVerified = domainRows.filter((d) => d.status === "verified").length;

    const result = computeDeliverability({
      windowDays: q.window_days,
      counts,
      suppressions: { total: supTotal, byReason },
      domains: { total: dTotal, verified: dVerified, unverified: dTotal - dVerified },
    });

    return { object: "deliverability", scope: { sub_tenant_id: st ?? null }, ...result };
  });
}
