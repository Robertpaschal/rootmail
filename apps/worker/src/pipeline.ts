import { and, eq } from "drizzle-orm";
import {
  type AuditEvent,
  enqueueWebhookEvent,
  newId,
  type SendJobData,
  testRecipientFor,
  WEBHOOK_EVENTS,
} from "@rootmail/core";
import { activeReplyDomain, auditEntries, db, type Message, type MessageAttachment, messages, openConversationForSend, organizations, resolveReplyTo, subTenants, suppressions, workspaces } from "@rootmail/db";
import { getProviderFor } from "./providers";
import type { OutboundAttachment } from "./providers/types";

/** Fetch each attachment's bytes from its public asset URL (host-independent). */
async function loadAttachments(list: MessageAttachment[]): Promise<OutboundAttachment[]> {
  const out: OutboundAttachment[] = [];
  for (const a of list) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(a.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.push({ filename: a.filename, contentType: a.content_type, content: Buffer.from(await res.arrayBuffer()) });
    } catch (err) {
      // Surface a clear, recorded reason instead of an opaque "fetch failed".
      throw new Error(`Couldn't load attachment "${a.filename}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

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
    .select({ subTenantId: suppressions.subTenantId, reason: suppressions.reason })
    .from(suppressions)
    .where(
      and(eq(suppressions.workspaceId, message.workspaceId), eq(suppressions.email, message.toEmail)),
    );
  return rows.some((r) => {
    if (r.subTenantId !== null && r.subTenantId !== message.subTenantId) return false;
    // Doctrine: an UNSUBSCRIBE opts out of bulk/marketing mail only — it can never
    // block transactional one-to-one mail (password resets, receipts, replies in a
    // live conversation). Bounces, complaints, and manual "never email" entries
    // protect deliverability, so they stop every send type.
    if (r.reason === "unsubscribe") return message.type === "marketing" || message.type === "sales";
    return true;
  });
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

  // RFC 8058 one-click unsubscribe on bulk mail (a Gmail/Yahoo bulk-sender
  // requirement): the signed per-recipient unsubscribe URL was injected into the
  // template variables at create time; surface it as headers so mailbox providers
  // can render their native "Unsubscribe" affordance. Transactional mail is exempt.
  const unsubUrl =
    message.type === "marketing" || message.type === "sales"
      ? (message.variables as Record<string, unknown> | null)?.unsubscribe_url
      : undefined;
  const headers =
    typeof unsubUrl === "string" && unsubUrl
      ? [
          { name: "List-Unsubscribe", value: `<${unsubUrl}>` },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
        ]
      : undefined;

  // Route real sends through the org's dedicated IP when it has one active — its
  // SES configuration set points at the dedicated IP pool. Sandbox sends use the
  // mock provider and never touch SES, so skip the lookup there — unless this is
  // a reserved test recipient, which takes the live path even from the sandbox.
  const scenario = testRecipientFor(message.toEmail);
  const livePath = !message.sandbox || scenario != null;
  let configurationSet: string | null = null;
  if (livePath) {
    const [org] = await db
      .select({ status: organizations.dedicatedIpStatus, configSet: organizations.dedicatedIpConfigSet })
      .from(organizations)
      .innerJoin(workspaces, eq(workspaces.organizationId, organizations.id))
      .where(eq(workspaces.id, message.workspaceId))
      .limit(1);
    if (org?.status === "active" && org.configSet) configurationSet = org.configSet;
  }

  // Open the conversation BEFORE sending, so an email a customer sends through
  // the API is as visible as one sent from the dashboard — and so a reply to it
  // has somewhere to land.
  //
  // This path is `POST /v1/messages`: the one a developer integrating rootmail
  // into their own product uses. Campaigns and sequences have threaded since
  // they were built; this never has. So the integration path — the one whose
  // replies are most likely to be a real person answering a real receipt — was
  // the only one where the answer went nowhere. (We hit the identical gap on our
  // own platform mail and fixed it for ourselves first, which is exactly the
  // asymmetry we said we would not ship.)
  //
  // Best-effort: threading must never fail a send that is otherwise fine.
  let replyTo = message.replyTo;
  try {
    const [wsRow] = await db
      .select({
        replyMode: organizations.replyMode,
        replyDomain: organizations.replyDomain,
        replyDomainStatus: organizations.replyDomainStatus,
      })
      .from(organizations)
      .innerJoin(workspaces, eq(workspaces.organizationId, organizations.id))
      .where(eq(workspaces.id, message.workspaceId))
      .limit(1);

    const thread = await openConversationForSend({
      workspaceId: message.workspaceId,
      subTenantId: message.subTenantId,
      contactEmail: message.toEmail,
      subject: message.subject,
      fromEmail: message.fromEmail,
      messageId: message.id,
      bodyHtml: message.renderedHtml,
      bodyText: message.renderedText,
    });

    // `explicit` wins inside resolveReplyTo, so a caller who set reply_to in
    // their API call keeps it — we add capture, we never override an
    // instruction their integration deliberately gave us.
    replyTo = resolveReplyTo({
      replyMode: wsRow?.replyMode,
      conversationId: thread.id,
      fromEmail: message.fromEmail,
      explicit: message.replyTo,
      // Branded own-domain replies only once receiving is actually live for it;
      // otherwise the shared address, so no reply is lost while it's pending.
      replyDomain: wsRow ? activeReplyDomain(wsRow) : null,
    });
    if (replyTo !== message.replyTo) {
      await db.update(messages).set({ replyTo, updatedAt: new Date() }).where(eq(messages.id, message.id));
    }
  } catch {
    /* threading is non-critical to the send */
  }

  const provider = getProviderFor(message.sandbox, message.toEmail);
  try {
    // Inside the try: if an attachment can't be fetched, the send fails cleanly
    // (status "failed" + reason) instead of throwing past the catch and leaving
    // the message stuck on "sending" while BullMQ retries forever.
    const attachments = message.attachments?.length ? await loadAttachments(message.attachments) : undefined;
    const result = await provider.send({
      messageId: message.id,
      from: { email: message.fromEmail, name: message.fromName },
      to: message.toEmail,
      replyTo,
      subject: message.subject,
      html: message.renderedHtml ?? "",
      text: message.renderedText ?? "",
      dkim,
      sandbox: message.sandbox,
      configurationSet,
      headers,
      attachments,
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
    // Record the test-alias → simulator mapping on the trail, so the audit shows
    // exactly where a test send actually went (never a hidden rewrite).
    await audit(message, "sent", {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      metadata: scenario
        ? {
            test_recipient: scenario.slug,
            delivered_to: scenario.simulator,
            expected_outcome: scenario.outcome,
          }
        : {},
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
