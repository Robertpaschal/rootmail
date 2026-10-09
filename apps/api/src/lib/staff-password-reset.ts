import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { env, getRedis, hashPassword, newId, randomToken, sendSystemEmail, sha256Hex } from "@rootmail/core";
import { db, staffResetTokens, staffSessions, staffUsers } from "@rootmail/db";
import { writeStaffAudit } from "./admin-auth";
import { staffPasswordChangedEmail, staffPasswordResetEmail } from "./emails";
import { clearAuthFailures } from "./login-throttle";

/**
 * Staff console password reset.
 *
 * Two ways to start one, one way to finish:
 *  - "Forgot password?" on the console login emails a link to the address on
 *    file (POST /v1/admin/auth/forgot-password).
 *  - `pnpm --filter @rootmail/api staff:reset-link --email …`, run on the prod
 *    host, prints the same kind of link — recovery that does not depend on
 *    email at all.
 * Either link is redeemed by POST /v1/admin/auth/reset-password.
 *
 * Only the SHA-256 of a token is stored. The raw token exists in the link and
 * nowhere else: never in a log, never in the audit trail.
 */

export const STAFF_RESET_TTL_MS = 30 * 60 * 1000;
/** 32 random bytes → 43 base64url characters. */
export const STAFF_RESET_TOKEN_BYTES = 32;

/** The staff password rule — the same one bootstrap and staff creation enforce. */
export const staffPassword = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Use at most 200 characters.");

export function staffConsoleOrigin(): string {
  const configured = env.STAFF_CONSOLE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return env.NODE_ENV === "production" ? `https://internal.${env.ROOTMAIL_DOMAIN}` : "http://localhost:3002";
}

export function staffResetUrl(token: string, base: string = staffConsoleOrigin()): string {
  return `${base.replace(/\/$/, "")}/login/reset?token=${encodeURIComponent(token)}`;
}

/** Mint a single-use reset token for an existing staff account. Returns the raw token ONCE. */
export async function mintStaffResetToken(staffUserId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(STAFF_RESET_TOKEN_BYTES);
  const expiresAt = new Date(now.getTime() + STAFF_RESET_TTL_MS);
  await db.insert(staffResetTokens).values({
    id: newId("staffResetToken"),
    staffUserId,
    tokenHash: sha256Hex(token),
    expiresAt,
  });
  return { token, expiresAt };
}

/** For logs about addresses that may not be staff: enough to correlate, not to read. */
export function emailFingerprint(email: string): string {
  return sha256Hex(email.trim().toLowerCase()).slice(0, 12);
}

// ---------------------------------------------------------------------------
// Rate limits. Counted for every request, staff or not, so a 429 says nothing
// about whether an address has an account. Same INCR+EXPIRE shape as
// signup-limit.ts.
// ---------------------------------------------------------------------------

export const STAFF_RESET_LIMITS = {
  /** Reset emails asked for, per address. */
  perEmail: 3,
  /** Reset emails asked for, per IP. */
  perIp: 10,
  /** Attempts to redeem a link, per IP. */
  redeemPerIp: 20,
  windowSeconds: 60 * 60,
};

export function staffResetKeys(ip: string, email?: string) {
  return {
    ip: `staff-reset:ip:${ip}`,
    redeemIp: `staff-reset:redeem-ip:${ip}`,
    email: email ? `staff-reset:email:${emailFingerprint(email)}` : undefined,
  };
}

async function take(key: string, limit: number): Promise<boolean> {
  const redis = getRedis();
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, STAFF_RESET_LIMITS.windowSeconds);
  return n <= limit;
}

export async function takeStaffResetRequestSlot(ip: string, email: string): Promise<{ ok: true } | { ok: false; scope: "ip" | "email" }> {
  const keys = staffResetKeys(ip, email);
  if (!(await take(keys.ip, STAFF_RESET_LIMITS.perIp))) return { ok: false, scope: "ip" };
  if (!(await take(keys.email!, STAFF_RESET_LIMITS.perEmail))) return { ok: false, scope: "email" };
  return { ok: true };
}

export async function takeStaffRedeemSlot(ip: string): Promise<boolean> {
  return take(staffResetKeys(ip).redeemIp, STAFF_RESET_LIMITS.redeemPerIp);
}

// ---------------------------------------------------------------------------
// Request (console "Forgot password?")
// ---------------------------------------------------------------------------

export type StaffResetRequestOutcome = "sent" | "unknown" | "deactivated";

/**
 * The work behind a forgot-password request. The route runs this AFTER it has
 * answered, so the response — body and timing — is the same for every address.
 */
export async function processStaffResetRequest(
  email: string,
  ip: string | undefined,
  log: Pick<FastifyBaseLogger, "info" | "warn">,
): Promise<StaffResetRequestOutcome> {
  const addr = email.trim().toLowerCase();
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, addr)).limit(1);

  // No staff row means no staff_audit row is possible (it needs a staff id), so
  // this lands in the API log instead — fingerprinted, never the raw address.
  if (!staff) {
    log.warn({ event: "staff.password_reset.request_unknown", email_fp: emailFingerprint(addr), ip }, "staff reset requested for unknown address");
    return "unknown";
  }
  if (staff.deactivatedAt) {
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "staff.password_reset.request_refused",
      targetType: "staff_user",
      targetId: staff.id,
      metadata: { via: "console", reason: "deactivated" },
      ip,
    });
    return "deactivated";
  }

  const { token, expiresAt } = await mintStaffResetToken(staff.id);
  const mail = staffPasswordResetEmail(staffResetUrl(token), staff.name);
  // security: a reset must not be silenceable by a suppression or preference.
  await sendSystemEmail({ to: staff.email, subject: mail.subject, html: mail.html, text: mail.text, cls: "security" });
  await writeStaffAudit({
    staffUserId: staff.id,
    action: "staff.password_reset.requested",
    targetType: "staff_user",
    targetId: staff.id,
    metadata: { via: "console", delivery: "email", expires_at: expiresAt.toISOString() },
    ip,
  });
  log.info({ event: "staff.password_reset.requested" }, "staff reset link emailed");
  return "sent";
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------

export type StaffResetResult =
  | { ok: true; staffUserId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "deactivated" };

/**
 * Spend a reset token and set the new password. The caller has already
 * validated the password against `staffPassword`, so a weak password never
 * burns the link.
 *
 * Claiming the token is one conditional UPDATE, so two simultaneous redeems
 * cannot both succeed. On success every other outstanding token for the
 * account is spent and every staff session is deleted.
 */
export async function completeStaffReset(token: string, password: string, ip?: string, now: Date = new Date()): Promise<StaffResetResult> {
  const tokenHash = sha256Hex(token);
  const [claimed] = await db
    .update(staffResetTokens)
    .set({ usedAt: now })
    .where(and(eq(staffResetTokens.tokenHash, tokenHash), isNull(staffResetTokens.usedAt), gt(staffResetTokens.expiresAt, now)))
    .returning();

  if (!claimed) {
    const [row] = await db.select().from(staffResetTokens).where(eq(staffResetTokens.tokenHash, tokenHash)).limit(1);
    if (!row) return { ok: false, reason: "invalid" };
    const reason = row.usedAt ? "used" : "expired";
    await writeStaffAudit({
      staffUserId: row.staffUserId,
      action: "staff.password_reset.failed",
      targetType: "staff_user",
      targetId: row.staffUserId,
      metadata: { reason, token_id: row.id },
      ip,
    });
    return { ok: false, reason };
  }

  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, claimed.staffUserId)).limit(1);
  if (!staff || staff.deactivatedAt) {
    if (staff) {
      await writeStaffAudit({
        staffUserId: staff.id,
        action: "staff.password_reset.failed",
        targetType: "staff_user",
        targetId: staff.id,
        metadata: { reason: "deactivated", token_id: claimed.id },
        ip,
      });
    }
    return { ok: false, reason: "deactivated" };
  }

  await db.transaction(async (tx) => {
    await tx.update(staffUsers).set({ passwordHash: hashPassword(password), updatedAt: now }).where(eq(staffUsers.id, staff.id));
    await tx
      .update(staffResetTokens)
      .set({ usedAt: now })
      .where(and(eq(staffResetTokens.staffUserId, staff.id), isNull(staffResetTokens.usedAt)));
    await tx.delete(staffSessions).where(eq(staffSessions.staffUserId, staff.id));
  });
  // They proved control of the account; a lockout from the guessing that
  // probably prompted this must not keep them out.
  await clearAuthFailures("staff", staff.email);

  await writeStaffAudit({
    staffUserId: staff.id,
    action: "staff.password_reset.completed",
    targetType: "staff_user",
    targetId: staff.id,
    metadata: { token_id: claimed.id, sessions_revoked: true },
    ip,
  });

  const mail = staffPasswordChangedEmail(staff.name);
  await sendSystemEmail({ to: staff.email, subject: mail.subject, html: mail.html, text: mail.text, cls: "security" }).catch(() => undefined);
  return { ok: true, staffUserId: staff.id };
}

// Work that runs after the response (see the forgot-password route). Tracked
// so tests and shutdown can wait for it instead of racing a closing database.
const inflight = new Set<Promise<unknown>>();
export function trackStaffReset<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  void p.finally(() => inflight.delete(p)).catch(() => undefined);
  return p;
}
export async function settleStaffResets(): Promise<void> {
  await Promise.allSettled([...inflight]);
}
