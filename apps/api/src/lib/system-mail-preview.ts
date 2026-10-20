import { sql } from "drizzle-orm";
import {
  announcementUnsubscribeUrl,
  env,
  Errors,
  newId,
  sendSystemEmail,
  type SystemMailJob,
  winBackJob,
} from "@rootmail/core";
import { db, ensureInternalAccount, transactionalDailyUsage } from "@rootmail/db";
import { currentDay } from "./billing";
import { announcementEmail } from "./emails";
import { platformRecipientsRestricted } from "./platform-recipients";
import { isTesterVerified } from "./ses-provisioning";

/**
 * Staff-only preview of a marketing-class system email, sent to the caller.
 *
 * The point is to see on a real received message exactly what customers get —
 * List-Unsubscribe, List-Unsubscribe-Post, DKIM, the config set, tracking — so
 * the job is built by the SAME builder as the real send and goes through the
 * SAME queue and worker (processSystemMail). The only difference is a
 * "[Preview] " subject prefix; headers are never touched.
 */
export const SYSTEM_MAIL_PREVIEW_KINDS = ["announcement", "win_back"] as const;
export type SystemMailPreviewKind = (typeof SYSTEM_MAIL_PREVIEW_KINDS)[number];
export const PREVIEW_SUBJECT_PREFIX = "[Preview] ";

const SAMPLE_ANNOUNCEMENT = {
  subject: "Announcement preview",
  body: "This is a preview of a rootmail product announcement.\n\nIt was sent only to you, from the staff console.",
};

/** The real job for `kind`, addressed to `to`, with the preview subject prefix. */
export function buildSystemMailPreviewJob(
  kind: SystemMailPreviewKind,
  to: string,
  name: string | null,
  announcement?: { subject?: string; body?: string },
): SystemMailJob {
  let job: SystemMailJob;
  if (kind === "win_back") {
    job = winBackJob({ email: to, name });
  } else {
    // Mirrors POST /v1/admin/announcements exactly: same builder, same class.
    const mail = announcementEmail({
      subject: announcement?.subject || SAMPLE_ANNOUNCEMENT.subject,
      body: announcement?.body || SAMPLE_ANNOUNCEMENT.body,
      recipientName: name,
      unsubscribeUrl: announcementUnsubscribeUrl(to),
    });
    job = { to, subject: mail.subject, html: mail.html, text: mail.text, cls: "marketing" };
  }
  return { ...job, subject: `${PREVIEW_SUBJECT_PREFIX}${job.subject}` };
}

/**
 * Reserve ONE send against today's sandbox cap (BETA_DAILY_SEND_CAP) on our
 * internal org's transactional daily counter, atomically. False when the cap is
 * already reached; otherwise today's count including this send. Previews are
 * the only system mail that writes this counter.
 */
async function tryReservePreviewSend(organizationId: string, cap: number): Promise<number | null> {
  if (cap <= 0) return null;
  const rows = await db
    .insert(transactionalDailyUsage)
    .values({ id: newId("usage"), organizationId, day: currentDay(), sent: 1 })
    .onConflictDoUpdate({
      target: [transactionalDailyUsage.organizationId, transactionalDailyUsage.day],
      set: { sent: sql`${transactionalDailyUsage.sent} + 1`, updatedAt: new Date() },
      setWhere: sql`${transactionalDailyUsage.sent} < ${cap}`,
    })
    .returning({ sent: transactionalDailyUsage.sent });
  return rows[0]?.sent ?? null;
}

async function refundPreviewSend(organizationId: string): Promise<void> {
  await db
    .update(transactionalDailyUsage)
    .set({ sent: sql`greatest(${transactionalDailyUsage.sent} - 1, 0)`, updatedAt: new Date() })
    .where(
      sql`${transactionalDailyUsage.organizationId} = ${organizationId} AND ${transactionalDailyUsage.day} = ${currentDay()}`,
    );
}

/**
 * Enqueue exactly one preview to `staff.email`. There is deliberately no
 * recipient parameter: the address is always the signed-in staff member's own.
 */
export async function sendSystemMailPreview(
  staff: { id: string; email: string; name: string | null },
  kind: SystemMailPreviewKind,
  announcement?: { subject?: string; body?: string },
): Promise<{ to: string; subject: string; used_today: number; daily_cap: number }> {
  const to = staff.email.trim().toLowerCase();
  const cap = env.BETA_DAILY_SEND_CAP;

  if (platformRecipientsRestricted() && !(await isTesterVerified(to))) {
    throw Errors.conflict(
      `Your address (${to}) hasn't been verified with our email provider yet, so a preview can't be delivered to it. Verify it first, then try again.`,
    );
  }

  const { organizationId } = await ensureInternalAccount();
  const usedToday = await tryReservePreviewSend(organizationId, cap);
  if (usedToday === null) {
    throw Errors.quotaExceeded(
      `Today's sandbox send cap (${cap}/day) is reached, so no preview was sent. It resets at midnight UTC.`,
      { daily_cap: cap },
    );
  }

  const job = buildSystemMailPreviewJob(kind, to, staff.name, announcement);
  try {
    await sendSystemEmail(job);
  } catch (err) {
    await refundPreviewSend(organizationId).catch(() => {});
    throw err;
  }
  return { to, subject: job.subject, used_today: usedToday, daily_cap: cap };
}
