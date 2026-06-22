import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db, messages, workspaces } from "@rootmail/db";

// Data-retention enforcement. For each workspace with a retention window set,
// messages older than that window are either redacted (PII/content stripped, but
// id + content_hash + status + audit kept so proof survives) or deleted outright
// (audit cascades). Workspaces with no policy (retention_days = null) are skipped,
// so this is a no-op until an operator opts in.

const BATCH = 1000;
// Safety cap per workspace per run; a daily sweep catches up over subsequent runs.
const MAX_PER_SWEEP = 50_000;
const REDACTED = "[redacted]";

async function redactBatch(workspaceId: string, cutoff: Date): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.workspaceId, workspaceId), lt(messages.createdAt, cutoff), isNull(messages.redactedAt)))
    .limit(BATCH);
  if (rows.length === 0) return 0;
  await db
    .update(messages)
    .set({
      // NOT NULL columns get a placeholder; nullable PII is cleared. content_hash,
      // status and timestamps are kept so the message stays provable.
      toEmail: REDACTED,
      fromEmail: REDACTED,
      fromName: null,
      replyTo: null,
      subject: REDACTED,
      renderedHtml: null,
      renderedText: null,
      variables: {},
      metadata: {},
      error: null,
      redactedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(messages.id, rows.map((r) => r.id)));
  return rows.length;
}

async function deleteBatch(workspaceId: string, cutoff: Date): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.workspaceId, workspaceId), lt(messages.createdAt, cutoff)))
    .limit(BATCH);
  if (rows.length === 0) return 0;
  await db.delete(messages).where(inArray(messages.id, rows.map((r) => r.id)));
  return rows.length;
}

/** Run one retention sweep across every workspace that has a policy. */
export async function processRetentionSweep(): Promise<void> {
  const wss = await db.select().from(workspaces).where(isNotNull(workspaces.retentionDays));
  for (const ws of wss) {
    if (!ws.retentionDays || ws.retentionDays <= 0) continue;
    const cutoff = new Date(Date.now() - ws.retentionDays * 86_400_000);
    let processed = 0;
    while (processed < MAX_PER_SWEEP) {
      const n =
        ws.retentionMode === "delete"
          ? await deleteBatch(ws.id, cutoff)
          : await redactBatch(ws.id, cutoff);
      if (n === 0) break;
      processed += n;
    }
    if (processed > 0) {
      console.log(
        `[retention] ${ws.retentionMode} ${processed} message(s) older than ${ws.retentionDays}d in workspace ${ws.id}`,
      );
    }
  }
}
