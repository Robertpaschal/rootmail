import { and, eq } from "drizzle-orm";
import {
  type AuditEvent,
  enqueueWebhookEvent,
  newId,
  type SendJobData,
  WEBHOOK_EVENTS,
} from "@rootmail/core";
import { auditEntries, db, type Message, messages, subTenants, suppressions } from "@rootmail/db";
import { getProviderFor } from "./providers";

interface AuditExtra {
  provider?: string | null;
  providerMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

async function audit(message: Message, event: AuditEvent, extra: AuditExtra = {}): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: message.workspaceId,
    subTenantId: message.subTenantId,
    messageId: message.id,
    event,
    actor: "system",
    provider: extra.provider ?? null,
    providerMessageId: extra.providerMessageId ?? null,
    metadata: extra.metadata ?? {},
  });

  const evt = `message.${event}`;
  if ((WEBHOOK_EVENTS as readonly string[]).includes(evt)) {
    void enqueueWebhookEvent({
      workspaceId: message.workspaceId,
      subTenantId: message.subTenantId,
      event: evt,
      data: { id: message.id, event: evt, occurred_at: new Date().toISOString() },
    });
  }
}

async function isSuppressedAtSend(message: Message): Promise<boolean> {
  const rows = await db
    .select({ subTenantId: suppressions.subTenantId })
    .from(suppressions)
    .where(
      and(eq(suppressions.workspaceId, message.workspaceId), eq(suppressions.email, message.toEmail)),
    );
  return rows.some((r) => r.subTenantId === null || r.subTenantId === message.subTenantId);
}

/** Process one send job: suppression → provider → status + audit transitions. */
export async function processSend(data: SendJobData): Promise<void> {
  const [message] = await db.select().from(messages).where(eq(messages.id, data.messageId)).limit(1);
  if (!message) {
    console.warn(`[send] message ${data.messageId} not found — skipping`);
    return;
  }
  // Idempotent: only process a message that's still queued/sending.
  if (message.status !== "queued" && message.status !== "sending") {
    return;
  }

  await db
    .update(messages)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(messages.id, message.id));
  await audit(message, "sending");

  if (await isSuppressedAtSend(message)) {
    await db
      .update(messages)
      .set({ status: "suppressed", updatedAt: new Date() })
      .where(eq(messages.id, message.id));
    await audit(message, "suppressed", { metadata: { reason: "suppressed at send time" } });
    return;
  }

  // DKIM material for the sub-tenant's domain, if this send is sub-tenant scoped.
  let dkim: { domain: string; selector: string; privateKeyPem: string } | null = null;
  if (message.subTenantId) {
    const [st] = await db
      .select()
      .from(subTenants)
      .where(eq(subTenants.id, message.subTenantId))
      .limit(1);
    if (st) {
      dkim = { domain: st.sendingDomain, selector: st.dkimSelector, privateKeyPem: st.dkimPrivateKey };
    }
  }

  const provider = getProviderFor(message.sandbox);
  try {
    const result = await provider.send({
      messageId: message.id,
      from: { email: message.fromEmail, name: message.fromName },
      to: message.toEmail,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.renderedHtml ?? "",
      text: message.renderedText ?? "",
      dkim,
      sandbox: message.sandbox,
    });

    await db
      .update(messages)
      .set({
        status: "sent",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
    await audit(message, "sent", {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    });

    // The mock provider has no async feedback, so simulate delivery inline.
    // Real providers (SES) report delivery/bounce/complaint asynchronously via
    // webhooks (Phase 1.5), so the message stays "sent" until one arrives.
    if (result.provider === "mock") {
      await db
        .update(messages)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(eq(messages.id, message.id));
      await audit(message, "delivered", {
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .update(messages)
      .set({ status: "failed", error: errorMessage, updatedAt: new Date() })
      .where(eq(messages.id, message.id));
    await audit(message, "failed", { metadata: { error: errorMessage } });
    throw err; // surface to BullMQ for retry/backoff
  }
}
