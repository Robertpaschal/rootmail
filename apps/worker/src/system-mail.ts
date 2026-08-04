import { and, eq } from "drizzle-orm";
import {
  env,
  newId,
  SUPPRESSION_BLOCKS,
  type SystemMailClass,
  type SystemMailJob,
} from "@rootmail/core";
import {
  db,
  ensureInternalAccount,
  messages,
  openConversationForSend,
  suppressions,
} from "@rootmail/db";
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

  try {
    await getProviderFor(false).send({
      messageId: message.id,
      from: { email: from, name: "rootmail" },
      to,
      replyTo: null,
      subject: job.subject,
      html: job.html,
      text: job.text,
      dkim: null,
      sandbox: false,
    });
    await db
      .update(messages)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(messages.id, message.id));

    // The thread is what makes a reply reachable. Best-effort on purpose: a
    // threading failure must never turn a delivered password reset into a
    // retry, which would send it a second time.
    try {
      await openConversationForSend({
        workspaceId,
        subTenantId: null,
        contactEmail: to,
        subject: job.subject,
        fromEmail: from,
        messageId: message.id,
        bodyHtml: job.html,
        bodyText: job.text,
      });
    } catch {
      /* the email is out; the thread is a convenience */
    }
  } catch (err) {
    await db
      .update(messages)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, message.id));
    throw err; // let BullMQ retry with its existing backoff
  }
}
