import { and, eq } from "drizzle-orm";
import { simpleParser } from "mailparser";
import {
  type AuditEvent,
  enqueueWebhookEvent,
  newId,
  WEBHOOK_EVENTS,
} from "@rootmail/core";
import { auditEntries, db, type Message, messages, threads } from "@rootmail/db";
import { addSuppression } from "./queries";
import { exitEnrollments } from "./sequence-triggers";
import { appendInbound } from "./threads";

// ---------------------------------------------------------------------------
// Amazon SES feedback notifications (Bounce / Complaint / Delivery), delivered
// via SNS. SES echoes the original send's message id as `mail.messageId`, which
// we stored as messages.providerMessageId — so each event maps straight back to
// our message. Permanent bounces and complaints add a suppression so we never
// send to that address again.
// ---------------------------------------------------------------------------

interface SesRecipient {
  emailAddress: string;
  // SES includes the SMTP diagnostic on bounced recipients, e.g.
  // "smtp; 550 5.1.1 <x>: Recipient address rejected: User unknown".
  diagnosticCode?: string;
  action?: string;
  status?: string;
}

export interface SesNotification {
  // SES domain/identity notifications use `notificationType`; configuration-set
  // event destinations use `eventType`. We accept either.
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string; destination?: string[]; source?: string };
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: SesRecipient[] };
  complaint?: { complainedRecipients?: SesRecipient[]; complaintFeedbackType?: string };
  delivery?: { recipients?: string[] };
  // Open/Click tracking (configuration-set event destinations only).
  open?: { ipAddress?: string; userAgent?: string };
  click?: { link?: string; ipAddress?: string; userAgent?: string };
  // Inbound ("Received") via an SES receipt rule's SNS action.
  receipt?: { recipients?: string[] };
  content?: string; // base64 raw MIME (SNS action, ≤150KB)
}

export type SesKind = "bounce" | "complaint" | "delivery" | "open" | "click" | "received" | "ignored";

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
  if (t === "open") return "open";
  if (t === "click") return "click";
  if (t === "received") return "received";
  return "ignored";
}

const REPLY_TOKEN = /^reply\+([^@]+)@/i;

/** Pull the thread id out of a `reply+<threadId>@…` recipient, or null. */
export function threadIdFromRecipients(recipients: string[]): string | null {
  for (const r of recipients) {
    const m = REPLY_TOKEN.exec(r.trim());
    if (m) return m[1];
  }
  return null;
}

/**
 * Ingest an inbound ("Received") SES email: match it to a thread via the
 * Reply-To token, parse the MIME body, and append it as an inbound message —
 * then fire `message.received` and exit any reply-triggered sequences.
 */
export async function applySesInbound(n: SesNotification): Promise<"received" | "ignored"> {
  const recipients = n.receipt?.recipients ?? n.mail?.destination ?? [];
  const threadId = threadIdFromRecipients(recipients);
  if (!threadId || !n.content) return "ignored";

  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return "ignored";

  const parsed = await simpleParser(Buffer.from(n.content, "base64"));
  const fromEmail = parsed.from?.value?.[0]?.address ?? n.mail?.source ?? "";
  if (!fromEmail) return "ignored";
  const toEmail = recipients.find((r) => REPLY_TOKEN.test(r.trim())) ?? "";

  await appendInbound(thread, {
    fromEmail,
    toEmail,
    bodyText: parsed.text ?? null,
    bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
  });

  void enqueueWebhookEvent({
    workspaceId: thread.workspaceId,
    subTenantId: thread.subTenantId,
    event: "message.received",
    data: { thread_id: thread.id, from: fromEmail, occurred_at: new Date().toISOString() },
  });
  void exitEnrollments(thread.workspaceId, fromEmail, "replied");
  return "received";
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

async function setStatus(message: Message, status: Message["status"], error?: string | null): Promise<void> {
  await db
    .update(messages)
    .set({ status, ...(error !== undefined ? { error } : {}), updatedAt: new Date() })
    .where(eq(messages.id, message.id));
}

/** True if this message already has an audit entry for `event` — used to dedupe
 * repeated provider notifications (SES can report the same delivery via both an
 * identity notification AND a config-set event, and fires an Open per render). */
async function hasAudit(messageId: string, event: AuditEvent): Promise<boolean> {
  const [row] = await db
    .select({ id: auditEntries.id })
    .from(auditEntries)
    .where(and(eq(auditEntries.messageId, messageId), eq(auditEntries.event, event)))
    .limit(1);
  return row != null;
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
    // Dedup (identity notification + config-set event both report delivery) and
    // never regress a terminal state a parallel event already set.
    if (await hasAudit(message.id, "delivered")) return "delivery";
    if (["queued", "sending", "sent"].includes(message.status)) {
      await setStatus(message, "delivered");
    }
    await audit(message, "delivered");
    return "delivery";
  }

  // Opens/clicks are engagement, not status — the status stays "delivered"; the
  // audit trail carries them (and the dashboard tracker reads them from there).
  // Only the FIRST open/click is recorded: SES fires an event per pixel render.
  if (kind === "open") {
    if (!(await hasAudit(message.id, "opened"))) {
      await audit(message, "opened", n.open?.userAgent ? { userAgent: n.open.userAgent } : {});
    }
    return "open";
  }

  if (kind === "click") {
    if (!(await hasAudit(message.id, "clicked"))) {
      await audit(message, "clicked", n.click?.link ? { url: n.click.link } : {});
    }
    return "click";
  }

  if (kind === "complaint") {
    const recipients = n.complaint?.complainedRecipients?.map((r) => r.emailAddress) ?? [message.toEmail];
    const reason = n.complaint?.complaintFeedbackType
      ? `Spam complaint (${n.complaint.complaintFeedbackType})`
      : "Spam complaint";
    await setStatus(message, "complained", reason);
    for (const email of recipients) {
      await addSuppression(message.workspaceId, message.subTenantId, email, "complaint", message.id, "ses");
    }
    await audit(message, "complained", { recipients, reason });
    return "complaint";
  }

  // bounce — only a Permanent bounce is final; transient bounces may still
  // deliver on SES's own retries, so we don't suppress on those. Capture the
  // SMTP diagnostic so the message carries *why* it bounced (powers diagnosis).
  const diagnostic = n.bounce?.bouncedRecipients?.find((r) => r.diagnosticCode)?.diagnosticCode;
  if (n.bounce?.bounceType === "Permanent") {
    const recipients = n.bounce?.bouncedRecipients?.map((r) => r.emailAddress) ?? [message.toEmail];
    const reason = diagnostic ?? `Permanent bounce${n.bounce?.bounceSubType ? ` (${n.bounce.bounceSubType})` : ""}`;
    await setStatus(message, "bounced", reason);
    for (const email of recipients) {
      await addSuppression(message.workspaceId, message.subTenantId, email, "bounce", message.id, "ses");
    }
    await audit(message, "bounced", { recipients, bounceType: "Permanent", reason });
    return "bounce";
  }

  await audit(message, "bounced", {
    bounceType: n.bounce?.bounceType ?? "Transient",
    suppressed: false,
    ...(diagnostic ? { reason: diagnostic } : {}),
  });
  return "bounce";
}
