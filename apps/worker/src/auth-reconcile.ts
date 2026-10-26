import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { env, getAuthContentVault, newId } from "@rootmail/core";
import { auditEntries, db, messages } from "@rootmail/db";

/** Classify expired orphaned claims; NEVER requeue or resend a credential. */
export async function reconcileAuthMessages(now = new Date()): Promise<number> {
  if (!env.AUTH_MESSAGES_ENABLED) return 0;
  // The provider call is bounded to 5s; wait an extra minute beyond the credential
  // deadline before classifying an interrupted send as unknown, not undelivered.
  const cutoff = new Date(now.getTime() - 60_000);
  const candidates = await db.select().from(messages).where(and(
    isNotNull(messages.authExpiresAt), lte(messages.authExpiresAt, cutoff), inArray(messages.status, ["queued", "sending"]),
  )).orderBy(messages.authExpiresAt).limit(100);
  let changed = 0;
  for (const row of candidates) {
    const reason = row.status === "sending" ? "auth_send_outcome_unknown" : "auth_expired";
    const updated = await db.transaction(async tx => {
      const [result] = await tx.update(messages).set({ status: "failed", error: reason, updatedAt: now })
        .where(and(eq(messages.id, row.id), eq(messages.status, row.status), lte(messages.authExpiresAt, cutoff)))
        .returning({ id: messages.id });
      if (!result) return false;
      await tx.insert(auditEntries).values({ id: newId("audit"), workspaceId: row.workspaceId, subTenantId: row.subTenantId,
        messageId: row.id, event: "failed", actor: "system", metadata: { reason, reconciled: true } });
      return true;
    });
    if (!updated) continue;
    changed++;
    try { await getAuthContentVault().discard({ ...row, authExpiresAt: row.authExpiresAt! }); }
    catch { /* Absolute TTL is still authoritative; never print cache diagnostics. */ }
  }
  return changed;
}
