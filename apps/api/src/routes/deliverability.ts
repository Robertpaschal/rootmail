import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { Errors, SUPPRESSION_REASONS, computeDeliverability } from "@rootmail/core";
import { db, reputationSnapshotInput, suppressions } from "@rootmail/db";
import { parse } from "../lib/validate";

const query = z.object({
  window_days: z.coerce.number().int().min(1).max(90).default(30),
  sub_tenant_id: z.string().optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(254).optional(),
  reason: z.enum(SUPPRESSION_REASONS).optional(),
  sub_tenant_id: z.string().optional(),
});

/** Escape LIKE metacharacters so a search for `a_b` is literal. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The effective client scope, identical to GET /v1/deliverability: the auth
 * scope pins it and a conflicting query param is rejected, never honoured.
 */
function effectiveScope(authScope: string | null, param: string | undefined): string | undefined {
  if (authScope && param && param !== authScope) {
    throw Errors.badRequest("sub_tenant_id conflicts with the X-Rootmail-Subtenant header");
  }
  return authScope ?? param ?? undefined;
}

export async function deliverabilityRoutes(app: FastifyInstance): Promise<void> {
  // Reputation snapshot from real send outcomes (+ domain-auth health). Read-only,
  // workspace-scoped; pass ?sub_tenant_id= to scope to one sending domain.
  app.get("/v1/deliverability", async (req) => {
    const q = parse(query, req.query);
    // Auth scope PINS this; a query param may narrow nothing and override
    // nothing. "Explicit param wins" is how a client-scoped key reads a
    // sibling's numbers — proven live: a key pinned to A passed
    // ?sub_tenant_id=B and got B's bounce rate back. The header is rejected at
    // the plugin, so the param was simply walking around the lock.
    const st = effectiveScope(req.auth.subTenant?.id ?? null, q.sub_tenant_id);

    // The sampling lives in @rootmail/db because the worker's reputation sweep
    // runs the SAME queries against the SAME scorer. When this route and the
    // enforcement loop disagree about a tenant's numbers, the operator is told
    // their client is fine while we throttle it — so there is one implementation.
    //
    // Note this read path counts sandbox sends and the sweep does not: the
    // dashboard of a sandbox workspace should describe the sandbox, but nobody's
    // client should be paused because a developer ran the bounce scenario.
    const snapshot = await reputationSnapshotInput({
      workspaceId: req.auth.workspace.id,
      subTenantId: st,
      windowDays: q.window_days,
    });

    const result = computeDeliverability(snapshot);

    return { object: "deliverability", scope: { sub_tenant_id: st ?? null }, ...result };
  });

  // Read-only list of the suppressed addresses behind the counts above.
  // Scoped EXACTLY like `suppressionCounts` (packages/db/src/reputation.ts):
  // always the auth workspace; a client scope narrows to that sub-tenant's
  // rows; no scope means the whole workspace. So the list and the counts can
  // never describe different sets. Newest first; offset-paged.
  app.get("/v1/suppressions", async (req) => {
    const q = parse(listQuery, req.query);
    const st = effectiveScope(req.auth.subTenant?.id ?? null, q.sub_tenant_id);

    const where: SQL[] = [eq(suppressions.workspaceId, req.auth.workspace.id)];
    if (st) where.push(eq(suppressions.subTenantId, st));
    if (q.reason) where.push(eq(suppressions.reason, q.reason));
    if (q.q) where.push(ilike(suppressions.email, `%${likeLiteral(q.q)}%`));
    const cond = and(...where);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: suppressions.id,
          email: suppressions.email,
          reason: suppressions.reason,
          source: suppressions.source,
          subTenantId: suppressions.subTenantId,
          createdAt: suppressions.createdAt,
        })
        .from(suppressions)
        .where(cond)
        .orderBy(desc(suppressions.createdAt), desc(suppressions.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ total: sql<number>`count(*)::int` }).from(suppressions).where(cond),
    ]);

    return {
      object: "list",
      data: rows.map((r) => ({
        object: "suppression",
        id: r.id,
        email: r.email,
        reason: r.reason,
        source: r.source,
        sub_tenant_id: r.subTenantId,
        created_at: r.createdAt.toISOString(),
      })),
      scope: { sub_tenant_id: st ?? null },
      page: q.page,
      limit: q.limit,
      total,
      has_more: q.page * q.limit < total,
    };
  });
}
