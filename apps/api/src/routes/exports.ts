import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, signProof } from "@rootmail/core";
import { auditEntries, db, messages } from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

// A single signed export is bounded so the bundle stays verifiable in one piece;
// larger histories are exported in narrower ranges.
const MAX_MESSAGES = 5000;

const query = z.object({
  from: z.string().datetime(),
  to: z.string().datetime().optional(),
  sub_tenant_id: z.string().optional(),
});

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  // Audit-grade, Ed25519-signed export of every message + its lifecycle in a
  // window — "prove exactly what we sent, signed + timestamped." The bundle is
  // independently verifiable by anyone via POST /v1/proof/verify with
  // { bundle, signature } (same key as single-message proofs). Enterprise.
  app.get("/v1/exports/compliance", async (req) => {
    await requireFeature(req, "proof");
    await requirePermission(req, "proof.read");
    const q = parse(query, req.query);
    const from = new Date(q.from);
    const to = q.to ? new Date(q.to) : new Date();
    if (to <= from) throw Errors.badRequest("`to` must be after `from`.");

    // Scope, in the same shape as GET /v1/messages: acting as a client PINS the
    // export to that client. Without this, a caller scoped to client A could omit
    // sub_tenant_id and walk away with a SIGNED bundle of the whole workspace, or
    // name client B outright. A signed export is the one artefact a customer
    // forwards to their own auditor, so it must never contain a sibling's mail.
    const authScope = req.auth.subTenant?.id ?? null;
    if (authScope && q.sub_tenant_id && q.sub_tenant_id !== authScope) {
      throw Errors.badRequest("sub_tenant_id conflicts with the X-Rootmail-Subtenant header");
    }
    const scope = authScope ?? q.sub_tenant_id ?? null;

    const conds = [
      eq(messages.workspaceId, req.auth.workspace.id),
      gte(messages.createdAt, from),
      lte(messages.createdAt, to),
    ];
    if (scope) conds.push(eq(messages.subTenantId, scope));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(asc(messages.createdAt))
      .limit(MAX_MESSAGES + 1);

    if (rows.length > MAX_MESSAGES) {
      throw Errors.badRequest(
        `Export would exceed ${MAX_MESSAGES} messages — narrow the date range or scope to a sub-tenant.`,
      );
    }

    // One query for every audit row, grouped back per message (preserves order).
    const ids = rows.map((m) => m.id);
    const trail = ids.length
      ? await db
          .select()
          .from(auditEntries)
          .where(inArray(auditEntries.messageId, ids))
          .orderBy(asc(auditEntries.occurredAt))
      : [];
    const byMessage = new Map<string, { event: string; occurred_at: string; actor: string }[]>();
    for (const a of trail) {
      if (!a.messageId) continue;
      const arr = byMessage.get(a.messageId) ?? [];
      arr.push({ event: a.event, occurred_at: a.occurredAt.toISOString(), actor: a.actor });
      byMessage.set(a.messageId, arr);
    }

    const bundle = {
      workspace_id: req.auth.workspace.id,
      // The EFFECTIVE scope, not the query param — a header-scoped export must
      // sign what it actually contains, or the bundle misdescribes itself.
      sub_tenant_id: scope,
      range: { from: from.toISOString(), to: to.toISOString() },
      generated_at: new Date().toISOString(),
      message_count: rows.length,
      messages: rows.map((m) => ({
        id: m.id,
        content_hash: m.contentHash,
        subject: m.subject,
        to: m.toEmail,
        from: m.fromEmail,
        status: m.status,
        created_at: m.createdAt.toISOString(),
        audit: byMessage.get(m.id) ?? [],
      })),
    };

    return { object: "compliance_export", bundle, ...signProof(bundle) };
  });
}
