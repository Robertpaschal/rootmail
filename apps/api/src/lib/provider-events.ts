import { and, eq } from "drizzle-orm";
import { enqueueWebhookEvent, newId } from "@rootmail/core";
import { auditEntries, db, type Message, messages } from "@rootmail/db";

/**
 * Applying a delivery outcome, whichever provider reported it.
 *
 * Extracted when Mailgun arrived, because the rules about which outcome may
 * REPLACE which are not provider-specific and must not be re-derived per
 * integration. A late bounce overwriting a complaint understates the complaint
 * rate — the tightest threshold the enforcement loop runs on — and getting that
 * right once in SES only to get it wrong again in Mailgun is exactly how two
 * implementations of the same rule drift apart.
 */

const AUDIT_FOR = {
  delivered: "delivered",
  bounced: "bounced",
  complained: "complained",
} as const;

export type ProviderOutcome = keyof typeof AUDIT_FOR;

/** Has this message already recorded this outcome? Providers retry and duplicate. */
async function alreadyRecorded(messageId: string, event: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auditEntries.id })
    .from(auditEntries)
    .where(and(eq(auditEntries.messageId, messageId), eq(auditEntries.event, event as never)))
    .limit(1);
  return row != null;
}

export async function applyProviderOutcome(
  message: Message,
  outcome: ProviderOutcome,
  reason: string | null,
  recipient: string,
): Promise<void> {
  const event = AUDIT_FOR[outcome];
  if (await alreadyRecorded(message.id, event)) return;

  // A complaint is the most serious thing a message can carry and is never
  // replaced. A delivery never regresses a terminal state either — a provider
  // can report delivery and then a bounce for the same message.
  const isTerminal = message.status === "bounced" || message.status === "complained";
  const mayWrite =
    outcome === "complained"
      ? message.status !== "complained"
      : outcome === "bounced"
        ? message.status !== "complained"
        : !isTerminal;

  if (mayWrite) {
    await db
      .update(messages)
      .set({ status: outcome, ...(reason !== null ? { error: reason } : {}), updatedAt: new Date() })
      .where(eq(messages.id, message.id));
  }

  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: message.workspaceId,
    subTenantId: message.subTenantId,
    messageId: message.id,
    event: event as never,
    actor: "system",
    actorId: null,
    provider: message.provider,
    providerMessageId: message.providerMessageId,
    metadata: { recipient, ...(reason ? { reason } : {}) },
  });

  void enqueueWebhookEvent({
    workspaceId: message.workspaceId,
    subTenantId: message.subTenantId,
    event: `message.${event}` as never,
    data: { id: message.id, event, recipient, occurred_at: new Date().toISOString() },
  });
}
