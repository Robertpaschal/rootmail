import { and, eq } from "drizzle-orm";
import {
  env,
  isUnconfirmedRecipientRejection,
  newId,
  RECIPIENT_UNCONFIRMED_ERROR,
  SUPPRESSION_BLOCKS,
  type SystemMailClass,
  type SystemMailJob,
} from "@rootmail/core";
import {
  db,
  ensureInternalAccount,
  messages,
  openConversationForSend,
  resolveReplyTo,
  suppressions,
} from "@rootmail/db";
import { addSesNoTrack, platformConfigurationSet } from "./platform-mail";
import { getProviderFor } from "./providers";

/**
 * Platform mail — the email rootmail sends its own customers.
 *
 * This used to hand every welcome, receipt, quota warning and win-back straight
 * to the provider with "no DB message, no thread, no quota". It was the fastest
 * possible path, and it cost us the ability to answer the question our product
 * exists to answer: did it land? No message row meant no bounce rate, no
 * complaint rate, nothing on our own deliverability page. No thread meant a
 * customer who replied was replying into a void. And nothing consulted our own
 * suppression list, so a complaint about us changed nothing.
 *
 * It now runs through the product we sell, into our own workspace: a real
 * message, a real thread, real events. If our own deliverability is bad we find
 * out the way a customer would — by looking at the dashboard.
 *
 * WHAT MAY STOP AN EMAIL DEPENDS ON WHAT IT IS. Sending password resets down
 * the same suppressing pipeline as announcements would be a security bug, not a
 * simplification: one "mark as spam" would permanently disable that account's
 * password recovery, and an attacker who provoked a single complaint would
 * silence every "your password was changed" warning we'd send the real owner.
 * The class decides, from SUPPRESSION_BLOCKS — see SYSTEM_MAIL_CLASSES.
 */

/** Resolved once per process; the account itself is created at API boot. */
let internal: { organizationId: string; workspaceId: string } | null = null;
async function internalAccount(): Promise<{ organizationId: string; workspaceId: string }> {
  if (!internal) {
    const a = await ensureInternalAccount();
    internal = { organizationId: a.organizationId, workspaceId: a.workspaceId };
  }
  return internal;
}

/**
 * The reason this send is blocked, or null.
 *
 * Reads the allow-list from SUPPRESSION_BLOCKS rather than branching, so
 * "security mail is stopped only by a hard bounce" stays a fact about data and
 * can't drift as this function grows.
 */
async function blockedBy(
  workspaceId: string,
  to: string,
  cls: SystemMailClass,
): Promise<string | null> {
  const rows = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.email, to)));

  const blocking = SUPPRESSION_BLOCKS[cls];
  for (const r of rows) if (blocking.includes(r.reason)) return r.reason;
  return null;
}

export async function processSystemMail(job: SystemMailJob): Promise<void> {
  // Absent on jobs enqueued before this shipped (a rolling deploy, an old
  // retry). Treated as transactional: gated normally, never silently promoted
  // into the security class that bypasses suppression.
  const cls: SystemMailClass = job.cls ?? "transactional";
  const from = job.from ?? `no-reply@${env.ROOTMAIL_DOMAIN}`;
  const to = job.to.toLowerCase();

  const { workspaceId } = await internalAccount();

  // "transactional" to the rest of the system: our mail is never bulk to a
  // purchased list, even when its class is "marketing" (a feature announcement
  // to existing customers is relationship mail). The CLASS above, not this
  // column, is what governs suppression.
  const [message] = await db
    .insert(messages)
    .values({
      id: newId("message"),
      workspaceId,
      subTenantId: null,
      type: "transactional",
      status: "queued",
      fromEmail: from,
      fromName: "rootmail",
      toEmail: to,
      subject: job.subject,
      renderedHtml: job.html,
      renderedText: job.text,
      // Which platform email this was, so our analytics can tell a password
      // reset from a win-back without parsing subject lines.
      metadata: { platform_mail_class: cls, organization_id: job.organizationId ?? null },
    })
    .returning();

  const blocked = await blockedBy(workspaceId, to, cls);
  if (blocked) {
    await db
      .update(messages)
      .set({ status: "suppressed", error: `suppressed: ${blocked}`, updatedAt: new Date() })
      .where(eq(messages.id, message.id));
    return;
  }

  /**
   * Open the thread BEFORE sending, so the mail can carry a Reply-To that
   * reaches it.
   *
   * This used to run after the send with `replyTo: null`, which produced the
   * worst of both: we opened a conversation in our own inbox for every welcome,
   * receipt and announcement, and the recipient could not reply into it. Their
   * reply went to `no-reply@` and died. We were reading a thread nobody could
   * answer — in the product whose pitch is that replies come back to you.
   *
   * Still best-effort, and that ordering matters: a threading failure must never
   * throw here, because the job would retry and send a password reset twice.
   * It degrades to a send with no Reply-To — exactly the old behaviour.
   */
  let replyTo: string | null = null;
  try {
    const thread = await openConversationForSend({
      workspaceId,
      subTenantId: null,
      contactEmail: to,
      subject: job.subject,
      fromEmail: from,
      messageId: message.id,
      bodyHtml: job.html,
      bodyText: job.text,
    });
    replyTo = resolveReplyTo({
      replyMode: "inbox",
      conversationId: thread.id,
      fromEmail: from,
      // A caller-chosen Reply-To (platformReplyTo() on mail that says "just reply") wins,
      // exactly as it does for a customer's API send.
      explicit: job.replyTo ?? null,
    });
  } catch {
    /* no thread — send anyway, as before, still honouring an explicit Reply-To */
    replyTo = job.replyTo ?? null;
  }

  const platformSet = platformConfigurationSet();
  try {
    await getProviderFor(false).send({
      messageId: message.id,
      from: { email: from, name: "rootmail" },
      to,
      replyTo,
      subject: job.subject,
      // Only with SES_PLATFORM_CONFIGURATION_SET set: that set, and no click
      // rewriting. Unset: the HTML as stored and no config set passed, so the
      // shared (tracked) set applies, as before. The stored copy is untouched.
      html: platformSet ? addSesNoTrack(job.html) : job.html,
      text: job.text,
      dkim: null,
      sandbox: false,
      ...(platformSet ? { configurationSet: platformSet } : {}),
    });
    await db
      .update(messages)
      .set({ status: "sent", replyTo, updatedAt: new Date() })
      .where(eq(messages.id, message.id));
  } catch (err) {
    // The sandbox refused an address that hasn't confirmed with Amazon yet.
    // Retrying cannot help — the person has to click a link first — and the
    // provider's text (our region and all) is not a reason we store. Record a
    // stable code; the API reads it back to tell the person what is true.
    const unconfirmed = isUnconfirmedRecipientRejection(err, to);
    await db
      .update(messages)
      .set({
        status: "failed",
        error: unconfirmed ? RECIPIENT_UNCONFIRMED_ERROR : err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
    if (unconfirmed) {
      console.warn(`[system-mail] ${message.id} (${cls}): recipient has not confirmed with the provider — not retrying`);
      return;
    }
    throw err; // let BullMQ retry with its existing backoff
  }
}
