import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RETENTION_MODES } from "@rootmail/core";
import { db, messages, workspaces } from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

const putBody = z.object({
  // null disables retention (keep forever). Max 10 years.
  retention_days: z.number().int().min(1).max(3650).nullable(),
  retention_mode: z.enum(RETENTION_MODES).optional(),
});

/** How many messages the policy would act on right now (for an impact preview). */
async function affectedCount(workspaceId: string, retentionDays: number | null, mode: string): Promise<number> {
  if (!retentionDays) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const conds = [eq(messages.workspaceId, workspaceId), lt(messages.createdAt, cutoff)];
  if (mode === "redact") conds.push(isNull(messages.redactedAt));
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(...conds));
  return row?.n ?? 0;
}

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  // Data-retention policy for the workspace. Enterprise (compliance) feature.
  app.get("/v1/retention", async (req) => {
    await requireFeature(req, "proof");
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, req.auth.workspace.id)).limit(1);
    return {
      object: "retention",
      retention_days: ws.retentionDays,
      retention_mode: ws.retentionMode,
      affected_now: await affectedCount(ws.id, ws.retentionDays, ws.retentionMode),
    };
  });

  // Setting/clearing retention is destructive governance — owner/admin only.
  app.put("/v1/retention", async (req) => {
    await requireFeature(req, "proof");
    await requirePermission(req, "billing.manage");
    const body = parse(putBody, req.body);
    const [ws] = await db
      .update(workspaces)
      .set({
        retentionDays: body.retention_days,
        ...(body.retention_mode ? { retentionMode: body.retention_mode } : {}),
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, req.auth.workspace.id))
      .returning();
    return {
      object: "retention",
      retention_days: ws.retentionDays,
      retention_mode: ws.retentionMode,
      affected_now: await affectedCount(ws.id, ws.retentionDays, ws.retentionMode),
    };
  });
}
