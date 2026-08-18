import type { MessageType, SuppressionReason } from "@rootmail/core";

/**
 * Whether a suppression list entry blocks THIS send.
 *
 * Pulled out of the worker as a pure function because it encodes two product
 * decisions that are easy to break by accident and impossible to notice when you
 * do — the mail simply stops, or worse, quietly starts again:
 *
 * 1. **Scope is hierarchical.** A workspace-level entry (null sub-tenant) blocks
 *    every send in the workspace, including a client's. A client-level entry
 *    blocks only that client's mail. One client's unsubscribe must never silence
 *    another client's mail, and the platform's own "never email this address"
 *    must reach all of them.
 *
 * 2. **An unsubscribe opts out of BULK mail only.** It can never block a password
 *    reset, a receipt, or a reply in a live conversation. Bounces, complaints and
 *    manual entries protect deliverability, so those stop everything.
 *
 * Rule 2 is the one platform buyers get burned by elsewhere, and rule 1 is what
 * makes per-client suppression mean anything at all.
 */
export interface SuppressionRow {
  /** Null = workspace-wide. */
  subTenantId: string | null;
  reason: SuppressionReason;
}

export function suppressionBlocks(
  row: SuppressionRow,
  send: { type: MessageType; subTenantId: string | null },
): boolean {
  // A client-scoped entry is irrelevant to any other client — and to the parent.
  if (row.subTenantId !== null && row.subTenantId !== send.subTenantId) return false;
  // Bulk-only opt-out.
  if (row.reason === "unsubscribe") return send.type === "marketing" || send.type === "sales";
  return true;
}

/** True if ANY entry on the list blocks this send. */
export function isSuppressed(
  rows: readonly SuppressionRow[],
  send: { type: MessageType; subTenantId: string | null },
): boolean {
  return rows.some((r) => suppressionBlocks(r, send));
}
