import { eq } from "drizzle-orm";
import {
  type AuditEvent,
  enqueueWebhookEvent,
  newId,
  WEBHOOK_EVENTS,
} from "@rootmail/core";
import { auditEntries, db, type Message, messages } from "@rootmail/db";
import { addSuppression } from "./queries";

// ---------------------------------------------------------------------------
// Amazon SES feedback notifications (Bounce / Complaint / Delivery), delivered
// via SNS. SES echoes the original send's message id as `mail.messageId`, which
// we stored as messages.providerMessageId — so each event maps straight back to
// our message. Permanent bounces and complaints add a suppression so we never
// send to that address again.
// ---------------------------------------------------------------------------

interface SesRecipient {
  emailAddress: string;
}

export interface SesNotification {
  // SES domain/identity notifications use `notificationType`; configuration-set
  // event destinations use `eventType`. We accept either.
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string; destination?: string[] };
  bounce?: { bounceType?: string; bouncedRecipients?: SesRecipient[] };
  complaint?: { complainedRecipients?: SesRecipient[] };
  delivery?: { recipients?: string[] };
}

export type SesKind = "bounce" | "complaint" | "delivery" | "ignored";

export function parseSesNotification(json: string): SesNotification | null {
  try {
    return JSON.parse(json) as SesNotification;
  } catch {
    return null;
  }
}

export function classify(n: SesNotification): SesKind {
  const t = (n.notificationType ?? n.eventType ?? "").toLowerCase();
  if (t === "bounce") return "bounce";
  if (t === "complaint") return "complaint";
  if (t === "delivery") return "delivery";
  return "ignored";
}

async function audit(message: Message, event: AuditEvent, metadata: Record<string, unknown> = {}): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId: message.workspaceId,
    subTenantId: message.subTenantId,
    messageId: message.id,
    event,
    actor: "system",
    provider: "ses",
    providerMessageId: message.providerMessageId,
    metadata,
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

async function setStatus(message: Message, status: Message["status"]): Promise<void> {
  await db.update(messages).set({ status, updatedAt: new Date() }).where(eq(messages.id, message.id));
}

/**
 * Apply one SES notification. Returns the action taken (useful for logging/tests).
 * Unknown event types or notifications for a message we don't have are ignored.
 */
export async function applySesNotification(n: SesNotification): Promise<SesKind> {
  const providerMessageId = n.mail?.messageId;
  const kind = classify(n);
  if (!providerMessageId || kind === "ignored") return "ignored";

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.providerMessageId, providerMessageId))
    .limit(1);
  if (!message) return "ignored";

  if (kind === "delivery") {
    await setStatus(message, "delivered");
    await audit(message, "delivered");
    return "delivery";
  }

  if (kind === "complaint") {
    const recipients = n.complaint?.complainedRecipients?.map((r) => r.emailAddress) ?? [message.toEmail];
    await setStatus(message, "complained");
    for (const email of recipients) {
      await addSuppression(message.workspaceId, message.subTenantId, email, "complaint", message.id, "ses");
    }
    await audit(message, "complained", { recipients });
    return "complaint";
  }

  // bounce — only a Permanent bounce is final; transient bounces may still
  // deliver on SES's own retries, so we don't suppress on those.
  if (n.bounce?.bounceType === "Permanent") {
    const recipients = n.bounce?.bouncedRecipients?.map((r) => r.emailAddress) ?? [message.toEmail];
    await setStatus(message, "bounced");
    for (const email of recipients) {
      await addSuppression(message.workspaceId, message.subTenantId, email, "bounce", message.id, "ses");
    }
    await audit(message, "bounced", { recipients, bounceType: "Permanent" });
    return "bounce";
  }

  await audit(message, "bounced", { bounceType: n.bounce?.bounceType ?? "Transient", suppressed: false });
  return "bounce";
}
