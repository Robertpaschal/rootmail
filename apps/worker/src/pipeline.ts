import { and, eq } from "drizzle-orm";
import {
  type AuditEvent,
  decryptSecret,
  enqueueSendDeferred,
  enqueueWebhookEvent,
  newId,
  REPUTATION_MAX_DEFERRALS,
  type SendJobData,
  takeThrottleToken,
  testRecipientFor,
  WEBHOOK_EVENTS,
  buildMessageId,
  replyThreadingHeaders,
  env,
} from "@rootmail/core";
import { activeReplyDomain, auditEntries, db, threadReplyParent, isSuppressed, type Message, type MessageAttachment, messages, openConversationForSend, organizations, resolveReplyTo, subTenants, suppressions, workspaces } from "@rootmail/db";
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
  // The decision — hierarchical scope, and "an unsubscribe is a bulk opt-out
  // only" — lives in @rootmail/db/suppression as a pure function so it can be
  // tested. See its comment for why both halves matter.
  return isSuppressed(rows, { type: message.type, subTenantId: message.subTenantId });
}

const PAUSED_ERROR =
  "Sending is paused for this client because of its reputation. The parent workspace can resume it from the dashboard.";

type ReputationGate = "ok" | "deferred" | "paused";

/**
 * Apply the tenant's current reputation state to one send.
 *
 * - `paused`    → the message fails, with a reason a human can act on.
 * - `throttled` → the message is re-queued into the next window, NOT dropped.
 *                 Throttling is a rate, not a rejection: the mail still goes,
 *                 just slowly enough to stop the tenant burning the shared
 *                 provider account while its operator fixes the list.
 * - otherwise   → straight through.
 */
async function reputationGate(message: Message, data: SendJobData): Promise<ReputationGate> {
  // Which reputation applies: the sub-tenant's when the send is on behalf of a
  // client, otherwise the workspace's own.
  //
  // This used to `return "ok"` for anything without a sub-tenant, which — since
  // sub-tenancy is a paid feature — meant the enforcement loop protected only
  // customers on the multi-tenant tier. An ordinary account mailing a purchased
  // list met no gate at all.
  let scopeId: string;
  let state: string;

  if (message.subTenantId) {
    const [st] = await db
      .select({ state: subTenants.reputationState })
      .from(subTenants)
      .where(eq(subTenants.id, message.subTenantId))
      .limit(1);
    if (!st) return "ok";
    scopeId = message.subTenantId;
    state = st.state;
  } else {
    const [ws] = await db
      .select({ state: workspaces.reputationState })
      .from(workspaces)
      .where(eq(workspaces.id, message.workspaceId))
      .limit(1);
    if (!ws) return "ok";
    scopeId = message.workspaceId;
    state = ws.state;
  }

  if (state === "paused") return "paused";
  if (state !== "throttled") return "ok";

  const verdict = await takeThrottleToken(scopeId);
  if (verdict.allowed) return "ok";

  const deferrals = (data.throttleDeferrals ?? 0) + 1;
  if (deferrals > REPUTATION_MAX_DEFERRALS) {
    // Past a day of trying, a queue is just a place messages go to be forgotten.
    // Fail it honestly so it shows up as failed rather than eternally pending.
    await db
      .update(messages)
      .set({
        status: "failed",
        error: `Held by a send throttle for over ${REPUTATION_MAX_DEFERRALS} hours.`,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
    await audit(message, "failed", {
      metadata: { reason: "throttle deferral limit reached", deferrals },
    });
    return "deferred";
  }

  await enqueueSendDeferred(
    { messageId: message.id, workspaceId: message.workspaceId, throttleDeferrals: deferrals },
    verdict.retryInMs,
  );
  return "deferred";
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

  // Reputation enforcement, BEFORE the "sending" transition.
  //
  // The API rejects sends for a paused tenant at request time, but this message
  // may have been queued (or scheduled days out, or fanned out by a campaign)
  // before the pause landed. A gate that only guards the front door lets exactly
  // the mail that caused the problem keep going out the back one.
  //
  // Checking here also means a throttled message can be deferred while it is
  // still honestly `queued` — flipping it to `sending` first would leave it
  // showing "sending" for an hour without anything being sent.
  const gate = await reputationGate(message, data);
  if (gate === "deferred") return;
  if (gate === "paused") {
    await db
      .update(messages)
      .set({ status: "failed", error: PAUSED_ERROR, updatedAt: new Date() })
      .where(eq(messages.id, message.id));
    await audit(message, "failed", { metadata: { reason: PAUSED_ERROR } });
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
      // Stored encrypted; rows written before that shipped are plaintext and pass
      // through untouched, so a half-backfilled table signs correctly either way.
      dkim = {
        domain: st.sendingDomain,
        selector: st.dkimSelector,
        privateKeyPem: decryptSecret(st.dkimPrivateKey),
      };
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
  const unsubHeaders =
    typeof unsubUrl === "string" && unsubUrl
      ? [
          { name: "List-Unsubscribe", value: `<${unsubUrl}>` },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
        ]
      : [];

  // RFC 5322 threading (brief P2.5). Every outbound message gets a Message-ID
  // DERIVED from its own id — no storage, no lookup, and no race with the thread
  // row that is written after this job is queued. `findThreadForReply` already
  // resolves a `msg_…` id, so an id quoted back to us needs no new machinery.
  //
  // Note SES REPLACES this with its own `<id@region.amazonses.com>`. It is still
  // worth setting: it is what non-SES providers send, and the inbound matcher
  // recognises both shapes.
  const sendingDomain = message.fromEmail.split("@")[1] ?? env.ROOTMAIL_DOMAIN;
  const threadingHeaders: { name: string; value: string }[] = [
    { name: "Message-ID", value: buildMessageId(message.id, sendingDomain) },
  ];
  // In-Reply-To / References are appended below, once the conversation this
  // message belongs to is known — the worker opens it a few lines further down,
  // and that is the only place the thread id exists on this path.
  const headers = [...unsubHeaders, ...threadingHeaders];

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

    // Now that the conversation is known, point this message at what the contact
    // actually sent. Without it their client files our answer as a NEW thread
    // beside the one they are reading — which is the visible half of the bug:
    // our replies did not thread on the recipient's side at all.
    const parent = await threadReplyParent(thread.id);
    if (parent) {
      headers.push(
        ...replyThreadingHeaders({
          rfcMessageId: parent.rfcMessageId,
          references: parent.references,
        }),
      );
    }

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
