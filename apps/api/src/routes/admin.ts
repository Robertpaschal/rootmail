import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import { Errors, generateSessionToken, newId, PLANS, verifyPassword } from "@rootmail/core";
import {
  auditEntries,
  db,
  impersonationGrants,
  type Message,
  memberships,
  messages,
  organizations,
  staffUsers,
  subTenants,
  suppressions,
  usageRecords,
  users,
  workspaces,
} from "@rootmail/db";
import { serializeAudit } from "../lib/serialize";
import {
  createStaffSession,
  deleteStaffSession,
  requireStaff,
  requireStaffRole,
  serializeStaff,
  staffBearer,
  writeStaffAudit,
} from "../lib/admin-auth";
import { currentPeriod } from "../lib/billing";
import { getStripe } from "../lib/stripe";
import { clearAuthFailures, isLockedOut, recordAuthFailure } from "../lib/login-throttle";
import { parse } from "../lib/validate";

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

// Slim message view for support — deliberately omits rendered_html/text (heavy,
// and not needed to triage). Use the customer API for the full rendered body.
function slimMessage(m: Message) {
  return {
    id: m.id,
    object: "message" as const,
    type: m.type,
    status: m.status,
    to: m.toEmail,
    subject: m.subject,
    sub_tenant_id: m.subTenantId,
    sandbox: m.sandbox,
    created_at: m.createdAt,
  };
}

// Admin surface — cross-org, staff-authenticated. Mounted under /v1/admin, which
// the customer auth hook treats as public so these routes can do their OWN staff
// auth (a customer key/session never reaches admin data).
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/admin/auth/login", async (req) => {
    const body = parse(loginBody, req.body);
    const email = body.email.toLowerCase();
    if (await isLockedOut("staff", email)) {
      throw Errors.rateLimited("Too many attempts. Try again in a few minutes.");
    }
    const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
    const ok = verifyPassword(body.password, staff?.passwordHash);
    if (!staff || !ok) {
      await recordAuthFailure("staff", email);
      throw Errors.unauthorized("Invalid email or password.");
    }
    await clearAuthFailures("staff", email);
    const { token, session } = await createStaffSession(staff.id);
    return { staff: serializeStaff(staff), session_token: token, session_expires_at: session.expiresAt };
  });

  app.post("/v1/admin/auth/logout", async (req) => {
    const token = staffBearer(req);
    if (token) await deleteStaffSession(token);
    return { ok: true };
  });

  app.get("/v1/admin/auth/me", async (req) => ({ staff: serializeStaff(await requireStaff(req)) }));

  // --- Cross-org directory (CRM) ------------------------------------------
  app.get("/v1/admin/orgs", async (req) => {
    await requireStaff(req);
    const orgs = await db
      .select()
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(200);
    const ids = orgs.map((o) => o.id);

    const memberCounts = ids.length
      ? await db
          .select({ orgId: memberships.organizationId, n: sql<number>`count(*)::int` })
          .from(memberships)
          .where(inArray(memberships.organizationId, ids))
          .groupBy(memberships.organizationId)
      : [];
    const usage = ids.length
      ? await db
          .select({ orgId: usageRecords.organizationId, sent: usageRecords.emailsSent })
          .from(usageRecords)
          .where(and(inArray(usageRecords.organizationId, ids), eq(usageRecords.period, currentPeriod())))
      : [];
    const mc = new Map(memberCounts.map((r) => [r.orgId, r.n]));
    const uc = new Map(usage.map((r) => [r.orgId, r.sent]));

    return {
      object: "list",
      data: orgs.map((o) => ({
        object: "org_summary",
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: o.plan,
        plan_status: o.planStatus,
        members: mc.get(o.id) ?? 0,
        usage_this_period: uc.get(o.id) ?? 0,
        created_at: o.createdAt,
      })),
    };
  });

  app.get("/v1/admin/orgs/:id", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");

    const ws = await db
      .select({ id: workspaces.id, name: workspaces.name, environment: workspaces.environment })
      .from(workspaces)
      .where(eq(workspaces.organizationId, id));
    const wsIds = ws.map((w) => w.id);

    const members = await db
      .select({ user_id: users.id, email: users.email, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, id));

    const [usg] = await db
      .select({ sent: usageRecords.emailsSent })
      .from(usageRecords)
      .where(and(eq(usageRecords.organizationId, id), eq(usageRecords.period, currentPeriod())))
      .limit(1);
    const [msgCount] = wsIds.length
      ? await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(inArray(messages.workspaceId, wsIds))
      : [{ n: 0 }];
    const [tenantCount] = wsIds.length
      ? await db.select({ n: sql<number>`count(*)::int` }).from(subTenants).where(inArray(subTenants.workspaceId, wsIds))
      : [{ n: 0 }];

    return {
      object: "org_detail",
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      plan_status: org.planStatus,
      postal_address: org.postalAddress ?? null,
      stripe_customer_id: org.stripeCustomerId ?? null,
      created_at: org.createdAt,
      workspaces: ws,
      members,
      usage_this_period: usg?.sent ?? 0,
      total_messages: msgCount?.n ?? 0,
      sub_tenants: tenantCount?.n ?? 0,
    };
  });

  // --- Support inspection (read-only) -------------------------------------
  const msgQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

  app.get("/v1/admin/orgs/:id/messages", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const { limit } = parse(msgQuery, req.query);
    const ws = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, id));
    const wsIds = ws.map((w) => w.id);
    if (wsIds.length === 0) return { object: "list", data: [] };
    const rows = await db
      .select()
      .from(messages)
      .where(inArray(messages.workspaceId, wsIds))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return { object: "list", data: rows.map(slimMessage) };
  });

  // Inspect any message + its full audit trail (cross-org). Read-only.
  app.get("/v1/admin/messages/:id", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!message) throw Errors.notFound("Message not found");

    let organization: { id: string; name: string } | null = null;
    if (message.workspaceId) {
      const [w] = await db
        .select({ orgId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, message.workspaceId))
        .limit(1);
      if (w) {
        const [o] = await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, w.orgId))
          .limit(1);
        organization = o ?? null;
      }
    }

    const trail = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id))
      .orderBy(asc(auditEntries.occurredAt));

    return {
      ...slimMessage(message),
      from: message.fromName
        ? { name: message.fromName, email: message.fromEmail }
        : { email: message.fromEmail },
      reply_to: message.replyTo,
      content_hash: message.contentHash,
      provider: message.provider,
      provider_message_id: message.providerMessageId,
      error: message.error,
      organization,
      workspace_id: message.workspaceId,
      audit: trail.map(serializeAudit),
    };
  });

  // --- Suppression management (support tooling) ---------------------------
  app.get("/v1/admin/orgs/:id/suppressions", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const { limit } = parse(msgQuery, req.query);
    const ws = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, id));
    const wsIds = ws.map((w) => w.id);
    if (wsIds.length === 0) return { object: "list", data: [] };
    const rows = await db
      .select()
      .from(suppressions)
      .where(inArray(suppressions.workspaceId, wsIds))
      .orderBy(desc(suppressions.createdAt))
      .limit(limit);
    return {
      object: "list",
      data: rows.map((s) => ({
        object: "suppression",
        id: s.id,
        email: s.email,
        reason: s.reason,
        source: s.source,
        sub_tenant_id: s.subTenantId,
        created_at: s.createdAt,
      })),
    };
  });

  // Clear a suppression (e.g. a wrongly-bounced contact). Audited; role-gated.
  app.delete("/v1/admin/suppressions/:id", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff, "support"); // superadmin auto-passes; readonly rejected
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(suppressions).where(eq(suppressions.id, id)).limit(1);
    if (!row) throw Errors.notFound("Suppression not found");
    await db.delete(suppressions).where(eq(suppressions.id, id));
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "suppression.clear",
      targetType: "suppression",
      targetId: id,
      metadata: { email: row.email, reason: row.reason },
      ip: req.ip,
    });
    return { object: "suppression", id, deleted: true };
  });

  // --- Impersonation (support/superadmin only) ----------------------------
  // Mints a ONE-TIME, 60s handoff code. The dashboard exchanges it for a
  // short-lived, impersonation-marked customer session — the session token
  // never travels in a URL. Every grant is written to the staff audit log.
  app.post("/v1/admin/users/:userId/impersonate", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff, "support"); // superadmin auto-passes; readonly is rejected
    const { userId } = req.params as { userId: string };
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw Errors.notFound("User not found");

    const { token: code, hash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + 60_000);
    await db.insert(impersonationGrants).values({
      id: newId("impersonationGrant"),
      codeHash: hash,
      staffUserId: staff.id,
      targetUserId: userId,
      expiresAt,
    });
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "impersonate.grant",
      targetType: "user",
      targetId: userId,
      metadata: { email: user.email },
      ip: req.ip,
    });
    return { code, expires_at: expiresAt };
  });

  // --- Platform analytics (read-only) -------------------------------------
  app.get("/v1/admin/analytics", async (req) => {
    await requireStaff(req);
    const period = currentPeriod();

    // Plan mix + MRR estimate (active paid orgs × list price; Enterprise = custom).
    const planRows = await db
      .select({
        plan: organizations.plan,
        status: organizations.planStatus,
        n: sql<number>`count(*)::int`,
      })
      .from(organizations)
      .groupBy(organizations.plan, organizations.planStatus);

    const byPlan: Record<string, number> = { free: 0, pro: 0, scale: 0, enterprise: 0 };
    const revenueByPlan: Record<string, number> = { pro: 0, scale: 0 };
    let totalOrgs = 0;
    let paidOrgs = 0;
    let mrr = 0;
    for (const r of planRows) {
      byPlan[r.plan] = (byPlan[r.plan] ?? 0) + r.n;
      totalOrgs += r.n;
      const price = PLANS[r.plan]?.price ?? null;
      if (price && price > 0) {
        paidOrgs += r.n;
        if (r.status === "active") {
          mrr += price * r.n;
          revenueByPlan[r.plan] = (revenueByPlan[r.plan] ?? 0) + price * r.n;
        }
      }
    }

    // Email + AI volume this period.
    const [vol] = await db
      .select({
        emails: sql<number>`coalesce(sum(${usageRecords.emailsSent}),0)::int`,
        ai: sql<number>`coalesce(sum(${usageRecords.aiCreditsUsed}),0)::int`,
      })
      .from(usageRecords)
      .where(eq(usageRecords.period, period));

    // Volume trend — last 6 periods, oldest first for charting.
    const trendDesc = await db
      .select({
        period: usageRecords.period,
        emails: sql<number>`coalesce(sum(${usageRecords.emailsSent}),0)::int`,
      })
      .from(usageRecords)
      .groupBy(usageRecords.period)
      .orderBy(desc(usageRecords.period))
      .limit(6);

    // Deliverability — status breakdown of real (non-sandbox) messages.
    const statusRows = await db
      .select({ status: messages.status, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.sandbox, false))
      .groupBy(messages.status);
    const byStatus: Record<string, number> = {};
    let totalMsgs = 0;
    for (const s of statusRows) {
      byStatus[s.status] = s.n;
      totalMsgs += s.n;
    }
    const rate = (n: number) => (totalMsgs > 0 ? Math.round((n / totalMsgs) * 1000) / 10 : 0);

    // Growth — new orgs in the last 30 days vs the prior 30.
    const now = Date.now();
    const d30 = new Date(now - 30 * 86_400_000);
    const d60 = new Date(now - 60 * 86_400_000);
    const [g] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizations)
      .where(gte(organizations.createdAt, d30));
    const [gp] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(organizations)
      .where(and(gte(organizations.createdAt, d60), lt(organizations.createdAt, d30)));
    const new30 = g?.n ?? 0;
    const prev30 = gp?.n ?? 0;

    return {
      object: "admin_analytics",
      period,
      orgs: { total: totalOrgs, paid: paidOrgs, by_plan: byPlan },
      revenue: { currency: "usd", mrr_estimate: mrr, by_plan: revenueByPlan },
      volume: { emails_this_period: vol?.emails ?? 0, trend: trendDesc.reverse() },
      deliverability: {
        total: totalMsgs,
        by_status: byStatus,
        delivered_rate: rate(byStatus.delivered ?? 0),
        bounce_rate: rate(byStatus.bounced ?? 0),
        complaint_rate: rate(byStatus.complained ?? 0),
      },
      ai: { credits_this_period: vol?.ai ?? 0 },
      growth: {
        new_orgs_30d: new30,
        prev_30d: prev30,
        change_pct: prev30 > 0 ? Math.round(((new30 - prev30) / prev30) * 1000) / 10 : null,
      },
    };
  });

  // --- Billing ops --------------------------------------------------------
  // Live Stripe view for an org: subscription items, recent invoices, balance.
  app.get("/v1/admin/orgs/:id/billing", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");

    const out: {
      object: "admin_billing";
      plan: string;
      plan_status: string;
      stripe_customer_id: string | null;
      balance: number; // Stripe customer balance in cents (negative = credit)
      subscription: {
        status: string;
        items: { description: string; unit_amount: number | null; quantity: number | null; interval: string | null }[];
      } | null;
      invoices: {
        id: string;
        number: string | null;
        status: string | null;
        total: number;
        currency: string;
        created: number;
        url: string | null;
      }[];
    } = {
      object: "admin_billing",
      plan: org.plan,
      plan_status: org.planStatus,
      stripe_customer_id: org.stripeCustomerId,
      balance: 0,
      subscription: null,
      invoices: [],
    };

    const stripe = getStripe();
    if (stripe && org.stripeCustomerId) {
      const customer = (await stripe.customers.retrieve(org.stripeCustomerId)) as Stripe.Customer;
      out.balance = customer.balance ?? 0;
      if (org.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
        out.subscription = {
          status: sub.status,
          items: sub.items.data.map((i) => ({
            description: i.price.nickname ?? i.price.id,
            unit_amount: i.price.unit_amount,
            quantity: i.quantity ?? null,
            interval: i.price.recurring?.interval ?? null,
          })),
        };
      }
      const invoices = await stripe.invoices.list({ customer: org.stripeCustomerId, limit: 10 });
      out.invoices = invoices.data.map((v) => ({
        id: v.id ?? "",
        number: v.number,
        status: v.status,
        total: v.total,
        currency: v.currency,
        created: v.created,
        url: v.hosted_invoice_url ?? null,
      }));
    }
    return out;
  });

  // Grant a goodwill account credit (Stripe customer balance). Money action →
  // superadmin only, and audited.
  const creditBody = z.object({
    amount_cents: z.coerce.number().int().min(1).max(1_000_000),
    reason: z.string().max(500).optional(),
  });
  app.post("/v1/admin/orgs/:id/credit", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff); // superadmin only (no other role passes)
    const { id } = req.params as { id: string };
    const { amount_cents, reason } = parse(creditBody, req.body);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");
    const stripe = getStripe();
    if (!stripe || !org.stripeCustomerId) {
      throw Errors.badRequest("This org has no Stripe customer to credit.");
    }
    // Negative balance delta = a credit applied to future invoices.
    await stripe.customers.createBalanceTransaction(org.stripeCustomerId, {
      amount: -amount_cents,
      currency: "usd",
      description: reason ? `Goodwill credit: ${reason}` : "Goodwill credit (staff)",
    });
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "billing.credit",
      targetType: "organization",
      targetId: id,
      metadata: { amount_cents, reason: reason ?? null },
      ip: req.ip,
    });
    return { object: "credit", amount_cents, applied: true };
  });
}
