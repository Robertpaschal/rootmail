import type { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import { contactCapForOrg, createRedis, env, PLANS, sendSystemEmail } from "@rootmail/core";
import { admitWaitlisted, billableContactCount, contactEvents, contactPackUnits, db, memberships, organizations, plans, usageRecords, users, workspaces } from "@rootmail/db";

// Conditional lifecycle email, sent by a daily sweep and de-duplicated in Redis so
// nothing re-sends. Bodies are inline + email-client-safe, matching the platform
// email style. Only the verified account owner is contacted, batches are capped, and
// the (marketing-ish) win-back respects the announcement opt-out.

const DAY_SEC = 86_400;
const DORMANT_DAYS = 21;
const USAGE_WARN_PCT = 80;
const MAX_PER_SWEEP = 500; // safety cap on outbound per run

function period(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dash(): string {
  return (env.DASHBOARD_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
function wrap(inner: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:480px">${inner}</div>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${label}</a>`;
}

/** Redis SET NX EX — true the first time a key is set (i.e. not yet sent in-window). */
async function claim(redis: Redis, key: string, ttlSec: number): Promise<boolean> {
  return (await redis.set(key, "1", "EX", ttlSec, "NX")) === "OK";
}

interface Owner {
  orgId: string;
  name: string | null;
  email: string;
  verified: boolean;
  optedOut: boolean;
  lastActiveAt: Date | null;
}

/** The account owner for each org (one row per org). */
async function ownersByOrg(): Promise<Owner[]> {
  const rows = await db
    .select({
      orgId: memberships.organizationId,
      name: users.name,
      email: users.email,
      verifiedAt: users.emailVerifiedAt,
      optOutAt: users.announcementOptOutAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.role, "owner"));
  return rows.map((r) => ({
    orgId: r.orgId,
    name: r.name,
    email: r.email,
    verified: r.verifiedAt != null,
    optedOut: r.optOutAt != null,
    lastActiveAt: r.lastActiveAt,
  }));
}

/**
 * Let waitlisted signups in wherever room has appeared (an upgrade, a contact
 * pack, or cleanup freed slots). Runs with the daily lifecycle sweep; oldest
 * signups admitted first, through the same door as a live signup — tag, welcome
 * sequences and all. A signup that hit the paywall is noted, never lost.
 */
async function admitWaitlistedSweep(): Promise<void> {
  const rows = await db
    .selectDistinct({ orgId: workspaces.organizationId })
    .from(contactEvents)
    .innerJoin(workspaces, eq(workspaces.id, contactEvents.workspaceId))
    .where(eq(contactEvents.kind, "waitlisted"));

  for (const { orgId } of rows) {
    try {
      const [org] = await db
        .select({ id: organizations.id, marketingTier: organizations.marketingTier, marketingContacts: organizations.marketingContacts })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org) continue;
      const cap = contactCapForOrg(org, await contactPackUnits(org.id));
      const used = await billableContactCount(org.id);
      const room = cap - used;
      if (room < 1) continue;
      const admitted = await admitWaitlisted(org.id, room);
      if (admitted > 0) console.log(`[lifecycle] admitted ${admitted} waitlisted signup(s) for ${org.id}`);
    } catch (err) {
      console.warn(`[lifecycle] waitlist admission failed for ${orgId}: ${String(err)}`);
    }
  }
}

export async function processLifecycleSweep(): Promise<void> {
  const redis = createRedis() as unknown as Redis;
  let sent = 0;
  try {
    await admitWaitlistedSweep().catch((err) => console.warn(`[lifecycle] waitlist sweep failed: ${String(err)}`));
    const owners = await ownersByOrg();
    const ownerByOrg = new Map(owners.map((o) => [o.orgId, o]));

    // --- Usage-limit warning: orgs ≥ 80% of this period's quota (transactional) ---
    const p = period();
    const orgs = await db
      .select({ id: organizations.id, plan: organizations.plan })
      .from(organizations);
    const usage = await db
      .select({ orgId: usageRecords.organizationId, used: usageRecords.emailsSent })
      .from(usageRecords)
      .where(eq(usageRecords.period, p));
    const usedByOrg = new Map(usage.map((u) => [u.orgId, u.used]));
    // Current per-plan quota (admin-editable), falling back to the static defaults.
    const planRows = await db.select({ id: plans.id, quota: plans.monthlyQuota }).from(plans);
    const quotaByPlan = new Map<string, number>(planRows.map((r) => [r.id, r.quota]));
    const quotaFor = (planId: string): number =>
      quotaByPlan.get(planId) ??
      (PLANS as Record<string, { monthlyQuota: number }>)[planId]?.monthlyQuota ??
      0;

    for (const org of orgs) {
      if (sent >= MAX_PER_SWEEP) break;
      const quota = quotaFor(org.plan);
      if (quota <= 0) continue; // unlimited / custom → no ceiling to warn about
      const used = usedByOrg.get(org.id) ?? 0;
      const pct = Math.round((used / quota) * 100);
      if (pct < USAGE_WARN_PCT) continue;
      const owner = ownerByOrg.get(org.id);
      if (!owner || !owner.verified) continue;
      if (!(await claim(redis, `lc:usage:${org.id}:${p}`, 40 * DAY_SEC))) continue; // once/period
      const mail = usageWarningEmail(owner.name, used, quota, pct);
      await sendSystemEmail({ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text });
      sent++;
    }

    // --- Inactivity win-back: dormant owners (marketing-ish → respects opt-out) ---
    const cutoff = new Date(Date.now() - DORMANT_DAYS * DAY_SEC * 1000);
    for (const owner of owners) {
      if (sent >= MAX_PER_SWEEP) break;
      if (!owner.verified || owner.optedOut) continue;
      // Never stamped (legacy/inactive) is treated as "not yet known" — skip until we
      // have a real activity signal, so we don't blast everyone on first rollout.
      if (!owner.lastActiveAt || owner.lastActiveAt >= cutoff) continue;
      if (!(await claim(redis, `lc:winback:${owner.orgId}`, 45 * DAY_SEC))) continue; // once/spell
      const mail = winBackEmail(owner.name);
      await sendSystemEmail({ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text });
      sent++;
    }

    if (sent > 0) console.log(`[lifecycle] sent ${sent} lifecycle email(s)`);
  } finally {
    await redis.quit().catch(() => {});
  }
}

function usageWarningEmail(name: string | null, used: number, quota: number, pct: number) {
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const plans = `${dash()}/billing?tab=plans`;
  return {
    subject: `You're at ${pct}% of your monthly email quota`,
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nYou've used ${used.toLocaleString()} of your ${quota.toLocaleString()} ` +
      `monthly emails (${pct}%). Upgrade any time to raise your limit and keep sending:\n${plans}`,
    html: wrap(
      `<p>${hi}</p><p>You've used <strong>${used.toLocaleString()}</strong> of your ${quota.toLocaleString()} monthly emails (${pct}%).</p>` +
        `<p>${button(plans, "Compare plans")}</p>` +
        `<p style="color:#666;font-size:13px">Upgrade any time to raise your limit and keep sending.</p>`,
    ),
  };
}

function winBackEmail(name: string | null) {
  const hi = name ? `Hi ${esc(name)},` : "Hi,";
  const d = dash();
  return {
    subject: "We miss you at rootmail",
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\nIt's been a while since you sent with rootmail — your account is ready ` +
      `when you are. Jump back in:\n${d}\n\nNeed a hand getting going again? Just reply to this email.`,
    html: wrap(
      `<p>${hi}</p><p>It's been a while since you sent with rootmail — your account's ready when you are.</p>` +
        `<p>${button(d, "Open your dashboard")}</p>` +
        `<p style="color:#666;font-size:13px">Need a hand getting going again? Just reply to this email.</p>`,
    ),
  };
}
