import { and, eq } from "drizzle-orm";
import { env, newId } from "@rootmail/core";
import { db, type Message, type Thread, threadMessages, threads } from "@rootmail/db";

/** Reply-To that routes a recipient's reply back to this thread via the SES
 * inbound webhook (`reply+<threadId>@<INBOUND_DOMAIN>`). Null when no inbound
 * domain is configured, so reply capture stays off until it's set.
 *
 * The domain is validated as a clean hostname: a misconfigured env (e.g. another
 * var bleeding in without a newline) must NEVER produce a malformed address that
 * a provider rejects — better to skip reply capture than to send a bad header. */
export function threadReplyAddress(threadId: string): string | null {
  const domain = env.INBOUND_DOMAIN?.trim();
  if (!domain || !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) return null;
  return `reply+${threadId}@${domain}`;
}

/** Every outbound send opens a thread with its first (outbound) message. */
export async function openThreadForSend(m: Message): Promise<Thread> {
  const [thread] = await db
    .insert(threads)
    .values({
      id: newId("thread"),
      workspaceId: m.workspaceId,
      subTenantId: m.subTenantId,
      contactEmail: m.toEmail,
      subject: m.subject,
      status: "open",
      lastMessageAt: new Date(),
    })
    .returning();

  await db.insert(threadMessages).values({
    id: newId("threadMessage"),
    threadId: thread.id,
    direction: "outbound",
    messageId: m.id,
    fromEmail: m.fromEmail,
    toEmail: m.toEmail,
    bodyHtml: m.renderedHtml,
    bodyText: m.renderedText,
  });

  return thread;
}

/** Resolve the thread a reply belongs to. `inReplyTo` may be a message id
 * (msg_…) — matched via its outbound thread entry — or a thread id (thr_…). */
export async function findThreadForReply(
  workspaceId: string,
  inReplyTo: string,
): Promise<Thread | null> {
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
  msg: { fromEmail: string; toEmail: string; bodyHtml?: string | null; bodyText?: string | null; messageId?: string | null },
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

/** The "from" identity to use when replying within a thread (the address the
 * original outbound used). */
export async function threadReplyFrom(threadId: string): Promise<string | null> {
  const [row] = await db
    .select({ fromEmail: threadMessages.fromEmail })
    .from(threadMessages)
    .where(and(eq(threadMessages.threadId, threadId), eq(threadMessages.direction, "outbound")))
    .limit(1);
  return row?.fromEmail ?? null;
}
