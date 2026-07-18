import { and, eq, isNull, sql } from "drizzle-orm";
import {
  appendBrandingFooter,
  appendComplianceFooter,
  type AuditEvent,
  enqueueSend,
  enqueueWebhookEvent,
  env,
  type MessageType,
  newId,
  render,
  sha256Hex,
  unsubscribeUrl,
  WEBHOOK_EVENTS,
  wingBrandingRequired,
} from "@rootmail/core";
import { auditEntries, contacts, db, marketingDailyUsage, messages, openConversationForSend, organizations, resolveReplyTo, suppressions, usageRecords } from "@rootmail/db";

// Shared send primitive for worker-driven automation (sequences + campaigns).
// Mirrors the API's dispatchMessage (apps/api/src/lib/dispatch.ts) but lives in
// the worker because apps can't import each other's internals — render, meter,
// audit (+ webhook), suppress-check, enqueue. (Future cleanup: a shared
// @rootmail/messaging package would unify the two.)

export interface AutomationSendInput {
  workspaceId: string;
  subTenantId: string | null;
  organizationId: string | null;
  mode: "live" | "test";
  type: MessageType;
  to: string;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  variables?: Record<string, unknown>;
  templateId?: string | null;
  templateVersion?: number | null;
  sequenceId?: string | null;
  sequenceStep?: number | null;
  campaignId?: string | null;
}

async function emitAudit(
  messageId: string,
  workspaceId: string,
  subTenantId: string | null,
  event: AuditEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditEntries).values({
    id: newId("audit"),
    workspaceId,
    subTenantId,
    messageId,
    event,
    actor: "system",
    metadata,
  });
  const evt = `message.${event}`;
  if ((WEBHOOK_EVENTS as readonly string[]).includes(evt)) {
    void enqueueWebhookEvent({
      workspaceId,
      subTenantId,
      event: evt,
      data: { id: messageId, event: evt, occurred_at: new Date().toISOString() },
    });
  }
}

function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function automationSend(
  input: AutomationSendInput,
): Promise<{ messageId: string; suppressed: boolean }> {
  const variables = {
    ...(input.variables ?? {}),
    unsubscribe_url: unsubscribeUrl({ w: input.workspaceId, e: input.to, s: input.subTenantId }),
  };
  let rendered = render({
    subject: input.subject,
    html: input.html,
    text: input.text ?? null,
    variables,
  });
  // CAN-SPAM: campaigns/sequences are commercial mail — append the sender's
  // postal address + unsubscribe BEFORE hashing (so Layer-3 proof matches the
  // sent email). Transactional automation, if any, is exempt.
  // One org lookup drives both footers: the postal address (compliance) and the
  // wing state (per-wing branding). One indexed PK read, reused below.
  let orgWings: {
    transactionalTier: string | null;
    transactionalBlocks: number;
    marketingTier: string | null;
  } | null = null;
  let postalAddress: string | null = null;
  let orgReplyMode: string | null = null;
  if (input.organizationId) {
    const [o] = await db
      .select({
        transactionalTier: organizations.transactionalTier,
        transactionalBlocks: organizations.transactionalBlocks,
        marketingTier: organizations.marketingTier,
        a: organizations.postalAddress,
        replyMode: organizations.replyMode,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    orgWings = o
      ? {
          transactionalTier: o.transactionalTier,
          transactionalBlocks: o.transactionalBlocks,
          marketingTier: o.marketingTier,
        }
      : null;
    postalAddress = o?.a ?? null;
    orgReplyMode = o?.replyMode ?? null;
  }
  if (input.type === "marketing" || input.type === "sales") {
    rendered = {
      ...rendered,
      ...appendComplianceFooter(rendered, {
        postalAddress,
        unsubscribeUrl: variables.unsubscribe_url,
      }),
    };
  }
  // Free-WING live mail carries the "Sent with rootmail" footer — branded per the
  // wing this message belongs to; paying for that wing removes it.
  if (input.mode === "live" && orgWings && wingBrandingRequired(input.type, orgWings)) {
    rendered = { ...rendered, ...appendBrandingFooter(rendered, { url: env.MARKETING_URL }) };
  }
  const contentHash = sha256Hex(rendered.html);

  const suppRows = await db
    .select({ s: suppressions.subTenantId })
    .from(suppressions)
    .where(and(eq(suppressions.workspaceId, input.workspaceId), eq(suppressions.email, input.to)));
  const suppressed = suppRows.some((r) => r.s === null || r.s === input.subTenantId);

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, input.workspaceId),
        input.subTenantId ? eq(contacts.subTenantId, input.subTenantId) : isNull(contacts.subTenantId),
        eq(contacts.email, input.to),
      ),
    )
    .limit(1);

  const id = newId("message");
  await db.insert(messages).values({
    id,
    workspaceId: input.workspaceId,
    subTenantId: input.subTenantId,
    type: input.type,
    toEmail: input.to,
    toContactId: contact?.id ?? null,
    fromEmail: input.fromEmail,
    fromName: input.fromName ?? null,
    replyTo: input.replyTo ?? null,
    subject: rendered.subject,
    templateId: input.templateId ?? null,
    templateVersion: input.templateVersion ?? null,
    variables,
    renderedHtml: rendered.html,
    renderedText: rendered.text,
    contentHash,
    sequenceId: input.sequenceId ?? null,
    sequenceStep: input.sequenceStep ?? null,
    campaignId: input.campaignId ?? null,
    status: suppressed ? "suppressed" : "queued",
    sandbox: input.mode === "test",
  });

  // Roll this send into the recipient's conversation (Layer 2) and stamp the
  // Reply-To per the org's reply mode — capture into the Replies inbox by default
  // so campaign/sequence replies are threaded too, the sender's own mailbox if
  // they chose that. Best-effort: threading never fails the send. (Skip suppressed
  // — they were never really sent.)
  if (!suppressed) {
    try {
      const thread = await openConversationForSend({
        workspaceId: input.workspaceId,
        subTenantId: input.subTenantId,
        contactEmail: input.to,
        subject: rendered.subject,
        fromEmail: input.fromEmail,
        messageId: id,
        bodyHtml: rendered.html,
        bodyText: rendered.text,
      });
      const replyTo = resolveReplyTo({
        replyMode: orgReplyMode,
        conversationId: thread.id,
        fromEmail: input.fromEmail,
        explicit: input.replyTo ?? null,
      });
      if (replyTo) await db.update(messages).set({ replyTo, updatedAt: new Date() }).where(eq(messages.id, id));
    } catch {
      /* threading is non-critical to the send */
    }
  }

  if (input.mode === "live" && input.organizationId) {
    // Per-wing metering (bulk path): transactional feeds the block meter; marketing/
    // sales feed the CONTACT-scaled monthly AND daily marketing caps (capacity is
    // asserted up front at the campaign/sequence entry — this just records).
    const isMarketing = input.type === "marketing" || input.type === "sales";
    await db
      .insert(usageRecords)
      .values({
        id: newId("usage"),
        organizationId: input.organizationId,
        period: currentPeriod(),
        emailsSent: isMarketing ? 0 : 1,
        marketingSent: isMarketing ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [usageRecords.organizationId, usageRecords.period],
        set: isMarketing
          ? { marketingSent: sql`${usageRecords.marketingSent} + 1`, updatedAt: new Date() }
          : { emailsSent: sql`${usageRecords.emailsSent} + 1`, updatedAt: new Date() },
      });
    if (isMarketing) {
      const day = new Date().toISOString().slice(0, 10);
      await db
        .insert(marketingDailyUsage)
        .values({ id: newId("usage"), organizationId: input.organizationId, day, sent: 1 })
        .onConflictDoUpdate({
          target: [marketingDailyUsage.organizationId, marketingDailyUsage.day],
          set: { sent: sql`${marketingDailyUsage.sent} + 1`, updatedAt: new Date() },
        });
    }
  }

  await emitAudit(id, input.workspaceId, input.subTenantId, "queued");
  if (suppressed) {
    await emitAudit(id, input.workspaceId, input.subTenantId, "suppressed", {
      reason: "recipient is on the suppression list",
    });
    return { messageId: id, suppressed: true };
  }

  await enqueueSend({ messageId: id, workspaceId: input.workspaceId });
  return { messageId: id, suppressed: false };
}
