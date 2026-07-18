import { and, desc, eq, isNull } from "drizzle-orm";
import { env, newId } from "@rootmail/core";
import { db } from "./client";
import { type Thread, threadMessages, threads } from "./schema";

// Conversations (Layer 2) — the per-CONTACT messaging space behind the Replies
// inbox. Every outbound send (transactional, campaign, or sequence) lands in the
// recipient's one conversation; replies routed back to us (see resolveReplyTo)
// attach to that same conversation. Shared by apps/api AND apps/worker, so the
// capture logic is identical no matter which surface sent the mail.

/** Is this the rootmail house no-reply address (the only "from" we never want a
 * human to receive replies at)? */
export function isRootmailNoReply(fromEmail: string): boolean {
  return fromEmail.toLowerCase() === `no-reply@${env.ROOTMAIL_DOMAIN}`.toLowerCase();
}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** Reply-To that routes a recipient's reply back to a conversation via the SES
 * inbound webhook (`reply+<conversationId>@<domain>`). Prefers the org's own
 * branded reply domain when one is passed (and active); otherwise the shared
 * rootmail INBOUND_DOMAIN. Null when neither is a valid hostname, so reply
 * capture stays off rather than emitting a header a provider would reject. */
export function threadReplyAddress(conversationId: string, ownDomain?: string | null): string | null {
  for (const d of [ownDomain?.trim(), env.INBOUND_DOMAIN?.trim()]) {
    if (d && HOSTNAME_RE.test(d)) return `reply+${conversationId}@${d}`;
  }
  return null;
}

/**
 * The Reply-To to stamp on an outbound message, honoring the org's reply mode:
 *
 * - `own_mailbox` — replies go straight to the sender's own From address (no
 *   capture); they handle replies in their own mail client.
 * - `inbox` (default) — replies route to a rootmail-received address so they land
 *   in the per-contact Replies inbox. Falls back to the From address if inbound
 *   capture isn't configured, so a reply is never sent into a black hole.
 *
 * An explicit caller-supplied Reply-To (e.g. the API's `reply_to`) always wins.
 * ("own_domain" — a branded reply subdomain — is Phase 2; it will resolve here.)
 */
export function resolveReplyTo(opts: {
  replyMode: string | null | undefined;
  conversationId: string;
  fromEmail: string;
  explicit?: string | null;
  /** The org's ACTIVE branded reply domain (reply.theirco.com), or null to use
   * the shared rootmail address. Pass only when receiving is live for it. */
  replyDomain?: string | null;
}): string | null {
  if (opts.explicit) return opts.explicit;
  const ownMailbox = isRootmailNoReply(opts.fromEmail) ? null : opts.fromEmail;
  if (opts.replyMode === "own_mailbox") return ownMailbox;
  return threadReplyAddress(opts.conversationId, opts.replyDomain) ?? ownMailbox;
}

/** The org's branded reply domain IF receiving is live (status "active"); else
 * null, so reply-to uses the shared rootmail address (no reply lost while a
 * domain is still being set up). */
export function activeReplyDomain(org: { replyDomain: string | null; replyDomainStatus: string }): string | null {
  return org.replyDomainStatus === "active" ? org.replyDomain : null;
}

/** The outbound message fields a conversation needs to record a send. */
export interface ConversationSend {
  workspaceId: string;
  subTenantId: string | null;
  contactEmail: string;
  subject: string;
  fromEmail: string;
  messageId?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
}

/**
 * Find (or open) the recipient's conversation and append this outbound send to
 * it — so all mail to a contact rolls up into one messaging space. Returns the
 * conversation; the caller stamps its reply address via `resolveReplyTo`.
 *
 * Best-effort by contract: callers wrap this so threading never fails a send.
 */
export async function openConversationForSend(m: ConversationSend): Promise<Thread> {
  const email = m.contactEmail.toLowerCase();
  const scope = m.subTenantId ? eq(threads.subTenantId, m.subTenantId) : isNull(threads.subTenantId);
  const [existing] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.workspaceId, m.workspaceId), scope, eq(threads.contactEmail, email)))
    .orderBy(desc(threads.lastMessageAt))
    .limit(1);

  let thread = existing;
  if (!thread) {
    [thread] = await db
      .insert(threads)
      .values({
        id: newId("thread"),
        workspaceId: m.workspaceId,
        subTenantId: m.subTenantId,
        contactEmail: email,
        subject: m.subject,
        status: "open",
        lastMessageAt: new Date(),
      })
      .returning();
  } else {
    // An outbound send doesn't itself need a reply — keep an open conversation
    // open, but never quietly clear a "needs_reply" flag the recipient raised.
    await db
      .update(threads)
      .set({
        status: thread.status === "needs_reply" ? "needs_reply" : "open",
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(threads.id, thread.id));
  }

  await db.insert(threadMessages).values({
    id: newId("threadMessage"),
    threadId: thread.id,
    direction: "outbound",
    messageId: m.messageId ?? null,
    fromEmail: m.fromEmail,
    toEmail: email,
    bodyHtml: m.bodyHtml ?? null,
    bodyText: m.bodyText ?? null,
  });

  return thread;
}

/** Resolve the conversation a reply belongs to. `inReplyTo` may be a message id
 * (msg_…) — matched via its outbound conversation entry — or a conversation id
 * (thr_…). */
export async function findThreadForReply(workspaceId: string, inReplyTo: string): Promise<Thread | null> {
  if (inReplyTo.startsWith("thr_")) {
    const [t] = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, inReplyTo), eq(threads.workspaceId, workspaceId)))
      .limit(1);
    return t ?? null;
  }
  const [row] = await db
    .select({ thread: threads })
    .from(threadMessages)
    .innerJoin(threads, eq(threads.id, threadMessages.threadId))
    .where(and(eq(threadMessages.messageId, inReplyTo), eq(threads.workspaceId, workspaceId)))
    .limit(1);
  return row?.thread ?? null;
}

export async function appendInbound(
  thread: Thread,
  msg: { fromEmail: string; toEmail: string; bodyHtml?: string | null; bodyText?: string | null },
): Promise<void> {
  await db.insert(threadMessages).values({
    id: newId("threadMessage"),
    threadId: thread.id,
    direction: "inbound",
    fromEmail: msg.fromEmail,
    toEmail: msg.toEmail,
    bodyHtml: msg.bodyHtml ?? null,
    bodyText: msg.bodyText ?? null,
  });
  await db
    .update(threads)
    .set({ status: "needs_reply", lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(threads.id, thread.id));
}

export async function appendOutbound(
  thread: Thread,
  msg: {
    fromEmail: string;
    toEmail: string;
    bodyHtml?: string | null;
    bodyText?: string | null;
    messageId?: string | null;
  },
): Promise<void> {
  await db.insert(threadMessages).values({
    id: newId("threadMessage"),
    threadId: thread.id,
    direction: "outbound",
    messageId: msg.messageId ?? null,
    fromEmail: msg.fromEmail,
    toEmail: msg.toEmail,
    bodyHtml: msg.bodyHtml ?? null,
    bodyText: msg.bodyText ?? null,
  });
  await db
    .update(threads)
    .set({ status: "open", lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(threads.id, thread.id));
}

/** The "from" identity to reply with inside a conversation (the address the
 * original outbound used). */
export async function threadReplyFrom(threadId: string): Promise<string | null> {
  const [row] = await db
    .select({ fromEmail: threadMessages.fromEmail })
    .from(threadMessages)
    .where(and(eq(threadMessages.threadId, threadId), eq(threadMessages.direction, "outbound")))
    .limit(1);
  return row?.fromEmail ?? null;
}
