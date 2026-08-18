import { and, eq } from "drizzle-orm";
import { env, sendSystemEmail } from "@rootmail/core";
import { db, memberships, organizations, users, workspaces } from "@rootmail/db";

/**
 * Telling an operator something happened to one of their clients.
 *
 * Two sweeps need this — the reputation loop (their client's NUMBERS went wrong)
 * and the DNS drift check (their client's RECORDS went missing) — and they must
 * agree on who to reach and how, or the same customer gets two different-looking
 * mails about the same tenant on the same afternoon.
 */

export function dashUrl(): string {
  return (env.DASHBOARD_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

/** Escape for interpolation into the HTML bodies below. */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/**
 * The one person to tell. Null when the workspace has no owner or the owner has
 * never verified their address — we do not send operational mail to an address
 * nobody has proved they control.
 */
export async function ownerForWorkspace(
  workspaceId: string,
): Promise<{ email: string; name: string | null } | null> {
  const [row] = await db
    .select({ email: users.email, name: users.name, verifiedAt: users.emailVerifiedAt })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(workspaces.id, workspaceId), eq(memberships.role, "owner")))
    .limit(1);
  if (!row || !row.verifiedAt) return null;
  return { email: row.email, name: row.name };
}

export interface TenantAlert {
  workspaceId: string;
  tenantId: string;
  tenantName: string;
  /** The one-line headline. Also the subject. */
  headline: string;
  /** Why, in the operator's language. */
  reason: string;
  /** What happens next, or what they should do. */
  next: string;
  /** Optional extra block rendered above the button — e.g. the exact DNS record. */
  detail?: string;
}

/**
 * Transactional, and genuinely so: this is account operations about someone
 * else's mail being stopped. It must never be silenceable by a marketing opt-out.
 */
export async function sendTenantAlert(alert: TenantAlert): Promise<void> {
  const owner = await ownerForWorkspace(alert.workspaceId);
  if (!owner) return;

  const link = `${dashUrl()}/sub-tenants/${alert.tenantId}`;
  const greeting = owner.name ? `Hi ${owner.name},` : "Hi,";

  await sendSystemEmail({
    to: owner.email,
    cls: "transactional",
    subject: alert.headline,
    text:
      `${greeting}\n\n${alert.headline}.\n\n${alert.reason}\n\n` +
      (alert.detail ? `${alert.detail}\n\n` : "") +
      `${alert.next}\n\n${link}`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:480px">` +
      `<p>${owner.name ? `Hi ${esc(owner.name)},` : "Hi,"}</p>` +
      `<p><strong>${esc(alert.headline)}.</strong></p>` +
      `<p>${esc(alert.reason)}</p>` +
      (alert.detail
        ? `<pre style="background:#f4f4f5;border-radius:6px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${esc(alert.detail)}</pre>`
        : "") +
      `<p style="color:#444">${esc(alert.next)}</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Open ${esc(alert.tenantName)}</a></p>` +
      `</div>`,
  });
}
