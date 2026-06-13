import { type AuditEvent, newId } from "@rootmail/core";
import { auditEntries, type Database } from "@rootmail/db";

export interface AuditInput {
  workspaceId: string;
  subTenantId?: string | null;
  messageId: string;
  event: AuditEvent;
  actor?: string;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append an immutable audit entry for a message lifecycle event. */
export async function writeAudit(db: Database, input: AuditInput): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: input.workspaceId,
    subTenantId: input.subTenantId ?? null,
    messageId: input.messageId,
    event: input.event,
    actor: input.actor ?? "system",
    actorId: input.actorId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    provider: input.provider ?? null,
    providerMessageId: input.providerMessageId ?? null,
    metadata: input.metadata ?? {},
  });
}
