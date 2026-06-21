import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import {
  ADD_ON_IDS,
  BILLING_INTERVALS,
  Errors,
  generateSessionToken,
  LEAD_STATUSES,
  newId,
  PLAN_IDS,
  type PlanId,
  verifyPassword,
} from "@rootmail/core";
import {
  addons,
  auditEntries,
  type CustomPlan,
  customPlans,
  db,
  impersonationGrants,
  type Lead,
  leadNotes,
  leads,
  type LeadNote,
  type Message,
  memberships,
  messages,
  organizations,
  plans,
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
import { getPlan, refreshPlanCache } from "../lib/plans";
import {
  cancelCustomSubscription,
  getStripe,
  provisionCustomSubscription,
  syncAddonPrice,
  syncCustomPlanPrice,
  syncPlanPrice,
} from "../lib/stripe";
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

function serializePlanRow(p: typeof plans.$inferSelect) {
  return {
    object: "plan" as const,
    id: p.id,
    name: p.name,
    price: p.price,
    monthly_quota: p.monthlyQuota,
    allow_overage: p.allowOverage,
    overage_per_1000_cents: p.overagePer1000Cents,
    included_sub_tenants: p.includedSubTenants,
    seats: p.seats,
    ai_credits: p.aiCredits,
    trial_days: p.trialDays,
    features: p.features,
    rank: p.rank,
    active: p.active,
    stripe_price_month_id: p.stripePriceMonthId,
    stripe_price_year_id: p.stripePriceYearId,
  };
}

function serializePromo(p: Stripe.PromotionCode) {
  const c = typeof p.promotion.coupon === "object" ? p.promotion.coupon : null;
  const discount = c
    ? c.percent_off
      ? `${c.percent_off}% off`
      : c.amount_off
        ? `$${(c.amount_off / 100).toFixed(2)} off`
        : ""
    : "";
  return {
    object: "promotion" as const,
    id: p.id,
    code: p.code,
    active: p.active,
    discount,
    duration: c?.duration ?? null,
    duration_in_months: c?.duration_in_months ?? null,
    times_redeemed: p.times_redeemed,
    max_redemptions: p.max_redemptions ?? null,
    expires_at: p.expires_at ?? null,
  };
}

function serializeAddonRow(a: typeof addons.$inferSelect) {
  return {
    object: "addon" as const,
    id: a.id,
    name: a.name,
    description: a.description,
    unit: a.unit,
    unit_amount: a.unitAmount,
    grant: a.grant,
    active: a.active,
    rank: a.rank,
    stripe_price_id: a.stripePriceId,
  };
}

function serializeLead(l: Lead, ownerEmail?: string | null) {
  return {
    object: "lead" as const,
    id: l.id,
    name: l.name,
    email: l.email,
    company: l.company,
    website: l.website,
    phone: l.phone,
    company_size: l.companySize,
    expected_volume: l.expectedVolume,
    current_provider: l.currentProvider,
    message: l.message,
    status: l.status,
    source: l.source,
    owner_staff_id: l.ownerStaffId,
    owner_email: ownerEmail ?? null,
    organization_id: l.organizationId,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  };
}

function serializeCustomPlan(c: CustomPlan) {
  return {
    object: "custom_plan" as const,
    id: c.id,
    organization_id: c.organizationId,
    lead_id: c.leadId,
    name: c.name,
    price_cents: c.priceCents,
    interval: c.interval,
    monthly_quota: c.monthlyQuota,
    allow_overage: c.allowOverage,
    overage_per_1000_cents: c.overagePer1000Cents,
    included_sub_tenants: c.includedSubTenants,
    seats: c.seats,
    ai_credits: c.aiCredits,
    active: c.active,
    stripe_product_id: c.stripeProductId,
    stripe_price_id: c.stripePriceId,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function serializeLeadNote(n: LeadNote, authorEmail?: string | null) {
  return {
    object: "lead_note" as const,
    id: n.id,
    body: n.body,
    kind: n.kind,
    staff_user_id: n.staffUserId,
    staff_email: authorEmail ?? null,
    created_at: n.createdAt,
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

    const [customPlan] = await db
      .select()
      .from(customPlans)
      .where(eq(customPlans.organizationId, id))
      .limit(1);

    return {
      object: "org_detail",
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      plan_status: org.planStatus,
      postal_address: org.postalAddress ?? null,
      stripe_customer_id: org.stripeCustomerId ?? null,
      stripe_subscription_id: org.stripeSubscriptionId ?? null,
      created_at: org.createdAt,
      workspaces: ws,
      members,
      usage_this_period: usg?.sent ?? 0,
      total_messages: msgCount?.n ?? 0,
      sub_tenants: tenantCount?.n ?? 0,
      custom_plan: customPlan ? serializeCustomPlan(customPlan) : null,
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
      const price = getPlan(r.plan).price;
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

  // --- Pricing management (data-driven plans) -----------------------------
  app.get("/v1/admin/plans", async (req) => {
    await requireStaff(req);
    const rows = await db.select().from(plans).orderBy(asc(plans.rank));
    return { object: "list", data: rows.map(serializePlanRow) };
  });

  const planPatch = z.object({
    name: z.string().min(1).max(60).optional(),
    price: z.number().int().min(0).max(1_000_000).nullable().optional(),
    monthly_quota: z.coerce.number().int().min(0).optional(),
    allow_overage: z.boolean().optional(),
    overage_per_1000_cents: z.coerce.number().int().min(0).max(100_000).optional(),
    included_sub_tenants: z.coerce.number().int().min(-1).optional(),
    seats: z.coerce.number().int().min(-1).optional(),
    ai_credits: z.coerce.number().int().min(-1).optional(),
    trial_days: z.coerce.number().int().min(0).max(365).optional(),
    features: z.array(z.string()).optional(),
    active: z.boolean().optional(),
  });
  // Edit plan economics. Pricing = money → superadmin only, and audited. App-side
  // fields (quota, seats, overage, AI credits, features) take effect immediately;
  // the billed Stripe price is synced separately (Phase B).
  app.patch("/v1/admin/plans/:id", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff); // superadmin only
    const { id } = req.params as { id: string };
    if (!(PLAN_IDS as readonly string[]).includes(id)) throw Errors.notFound("Plan not found");
    const body = parse(planPatch, req.body);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.price !== undefined) set.price = body.price;
    if (body.monthly_quota !== undefined) set.monthlyQuota = body.monthly_quota;
    if (body.allow_overage !== undefined) set.allowOverage = body.allow_overage;
    if (body.overage_per_1000_cents !== undefined) set.overagePer1000Cents = body.overage_per_1000_cents;
    if (body.included_sub_tenants !== undefined) set.includedSubTenants = body.included_sub_tenants;
    if (body.seats !== undefined) set.seats = body.seats;
    if (body.ai_credits !== undefined) set.aiCredits = body.ai_credits;
    if (body.trial_days !== undefined) set.trialDays = body.trial_days;
    if (body.features !== undefined) set.features = body.features;
    if (body.active !== undefined) set.active = body.active;

    const [before] = await db.select().from(plans).where(eq(plans.id, id as PlanId)).limit(1);
    if (!before) throw Errors.notFound("Plan not found");

    const [updated] = await db
      .update(plans)
      .set(set)
      .where(eq(plans.id, id as PlanId))
      .returning();
    await refreshPlanCache(); // economics live immediately

    // Billed-price change → create/swap the Stripe price (existing subs grandfathered).
    const priceChanged = body.price !== undefined && body.price !== before.price;
    let stripeSync: "synced" | "skipped" | "failed" | "unchanged" = priceChanged
      ? "skipped"
      : "unchanged";
    let row = updated;
    if (priceChanged) {
      try {
        const synced = await syncPlanPrice(updated);
        if (synced) {
          await refreshPlanCache(); // pick up the new Stripe price ids
          // Re-read so the response carries the freshly-synced price ids.
          const [after] = await db.select().from(plans).where(eq(plans.id, id as PlanId)).limit(1);
          if (after) row = after;
          stripeSync = "synced";
        }
      } catch (err) {
        req.log.error({ err }, "plan price sync to Stripe failed");
        stripeSync = "failed";
      }
    }

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "plan.update",
      targetType: "plan",
      targetId: id,
      metadata: { ...body, stripe_sync: stripeSync },
      ip: req.ip,
    });
    return { ...serializePlanRow(row), stripe_sync: stripeSync };
  });

  // --- Promotions (coupons + promo codes; Stripe-native) ------------------
  app.get("/v1/admin/promotions", async (req) => {
    await requireStaff(req);
    const stripe = getStripe();
    if (!stripe) return { object: "list", data: [] };
    const codes = await stripe.promotionCodes.list({
      limit: 100,
      expand: ["data.promotion.coupon"],
    });
    return { object: "list", data: codes.data.map(serializePromo) };
  });

  const promoBody = z.object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
    type: z.enum(["percent", "amount"]),
    value: z.coerce.number().positive(),
    duration: z.enum(["once", "repeating", "forever"]).default("once"),
    duration_in_months: z.coerce.number().int().positive().max(36).optional(),
    max_redemptions: z.coerce.number().int().positive().optional(),
  });
  // Create a coupon + a customer-facing promo code. Money lever → superadmin only,
  // audited. Redeemable immediately at checkout (allow_promotion_codes is on).
  app.post("/v1/admin/promotions", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const b = parse(promoBody, req.body);
    const stripe = getStripe();
    if (!stripe) throw Errors.badRequest("Stripe isn't configured.");
    if (b.type === "percent" && b.value > 100) {
      throw Errors.badRequest("Percent discount can't exceed 100.");
    }

    const coupon = await stripe.coupons.create({
      name: b.code.toUpperCase(),
      duration: b.duration,
      ...(b.type === "percent"
        ? { percent_off: b.value }
        : { amount_off: Math.round(b.value * 100), currency: "usd" }),
      ...(b.duration === "repeating" && b.duration_in_months
        ? { duration_in_months: b.duration_in_months }
        : {}),
    });
    const promo = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: b.code.toUpperCase(),
      expand: ["promotion.coupon"],
      ...(b.max_redemptions ? { max_redemptions: b.max_redemptions } : {}),
    });
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "promotion.create",
      targetType: "promotion",
      targetId: promo.id,
      metadata: { code: promo.code, type: b.type, value: b.value, duration: b.duration },
      ip: req.ip,
    });
    return serializePromo(promo);
  });

  app.post("/v1/admin/promotions/:id/deactivate", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const { id } = req.params as { id: string };
    const stripe = getStripe();
    if (!stripe) throw Errors.badRequest("Stripe isn't configured.");
    const promo = await stripe.promotionCodes.update(id, { active: false });
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "promotion.deactivate",
      targetType: "promotion",
      targetId: id,
      metadata: { code: promo.code },
      ip: req.ip,
    });
    return { object: "promotion", id, active: false };
  });

  // --- Add-on catalog (data-driven, like plans) ---------------------------
  app.get("/v1/admin/addons", async (req) => {
    await requireStaff(req);
    const rows = await db.select().from(addons).orderBy(asc(addons.rank));
    return { object: "list", data: rows.map(serializeAddonRow) };
  });

  const addonPatch = z.object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(300).optional(),
    unit: z.string().max(60).optional(),
    unit_amount: z.coerce.number().int().min(0).max(100_000).optional(),
    grant: z.coerce.number().int().min(1).max(1_000_000).optional(),
    active: z.boolean().optional(),
  });
  // Edit an add-on (superadmin, audited). Price change → Stripe sync (like plans);
  // grant/unit changes take effect immediately via the cache.
  app.patch("/v1/admin/addons/:id", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const { id } = req.params as { id: string };
    if (!(ADD_ON_IDS as readonly string[]).includes(id)) throw Errors.notFound("Add-on not found");
    const body = parse(addonPatch, req.body);

    const [before] = await db.select().from(addons).where(eq(addons.id, id)).limit(1);
    if (!before) throw Errors.notFound("Add-on not found");

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.description !== undefined) set.description = body.description;
    if (body.unit !== undefined) set.unit = body.unit;
    if (body.unit_amount !== undefined) set.unitAmount = body.unit_amount;
    if (body.grant !== undefined) set.grant = body.grant;
    if (body.active !== undefined) set.active = body.active;

    const [updated] = await db.update(addons).set(set).where(eq(addons.id, id)).returning();
    await refreshPlanCache();

    const priceChanged = body.unit_amount !== undefined && body.unit_amount !== before.unitAmount;
    let stripeSync: "synced" | "skipped" | "failed" | "unchanged" = priceChanged
      ? "skipped"
      : "unchanged";
    let row = updated;
    if (priceChanged) {
      try {
        const synced = await syncAddonPrice(updated);
        if (synced) {
          await refreshPlanCache();
          const [after] = await db.select().from(addons).where(eq(addons.id, id)).limit(1);
          if (after) row = after;
          stripeSync = "synced";
        }
      } catch (err) {
        req.log.error({ err }, "addon price sync to Stripe failed");
        stripeSync = "failed";
      }
    }

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "addon.update",
      targetType: "addon",
      targetId: id,
      metadata: { ...body, stripe_sync: stripeSync },
      ip: req.ip,
    });
    return { ...serializeAddonRow(row), stripe_sync: stripeSync };
  });

  // --- Sales CRM (enterprise "Contact sales" leads) -----------------------
  const leadQuery = z.object({
    status: z.enum(LEAD_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  });
  app.get("/v1/admin/leads", async (req) => {
    await requireStaff(req);
    const { status, limit } = parse(leadQuery, req.query);
    const rows = await db
      .select({ lead: leads, ownerEmail: staffUsers.email })
      .from(leads)
      .leftJoin(staffUsers, eq(staffUsers.id, leads.ownerStaffId))
      .where(status ? eq(leads.status, status) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(limit);

    // Pipeline counts power the status tabs in the admin UI.
    const countRows = await db
      .select({ status: leads.status, n: sql<number>`count(*)::int` })
      .from(leads)
      .groupBy(leads.status);
    const counts: Record<string, number> = {};
    for (const s of LEAD_STATUSES) counts[s] = 0;
    for (const r of countRows) counts[r.status] = r.n;

    return {
      object: "list",
      data: rows.map((r) => serializeLead(r.lead, r.ownerEmail)),
      counts,
    };
  });

  app.get("/v1/admin/leads/:id", async (req) => {
    await requireStaff(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select({ lead: leads, ownerEmail: staffUsers.email })
      .from(leads)
      .leftJoin(staffUsers, eq(staffUsers.id, leads.ownerStaffId))
      .where(eq(leads.id, id))
      .limit(1);
    if (!row) throw Errors.notFound("Lead not found");

    const notes = await db
      .select({ note: leadNotes, authorEmail: staffUsers.email })
      .from(leadNotes)
      .leftJoin(staffUsers, eq(staffUsers.id, leadNotes.staffUserId))
      .where(eq(leadNotes.leadId, id))
      .orderBy(desc(leadNotes.createdAt));

    let organization: { id: string; name: string; plan: string } | null = null;
    if (row.lead.organizationId) {
      const [o] = await db
        .select({ id: organizations.id, name: organizations.name, plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, row.lead.organizationId))
        .limit(1);
      organization = o ?? null;
    }

    return {
      ...serializeLead(row.lead, row.ownerEmail),
      organization,
      notes: notes.map((n) => serializeLeadNote(n.note, n.authorEmail)),
    };
  });

  const leadPatch = z.object({
    status: z.enum(LEAD_STATUSES).optional(),
    owner_staff_id: z.string().nullable().optional(),
    organization_id: z.string().nullable().optional(),
  });
  // Work a lead's pipeline (status / owner / linked org). Not a money action, so
  // support staff (and superadmins) can; readonly cannot. Status & assignment
  // changes are auto-logged to the lead's activity timeline and the staff audit.
  app.patch("/v1/admin/leads/:id", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff, "support");
    const { id } = req.params as { id: string };
    const body = parse(leadPatch, req.body);

    const [before] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!before) throw Errors.notFound("Lead not found");

    if (body.owner_staff_id) {
      const [s] = await db
        .select({ id: staffUsers.id })
        .from(staffUsers)
        .where(eq(staffUsers.id, body.owner_staff_id))
        .limit(1);
      if (!s) throw Errors.badRequest("Unknown staff user for owner.");
    }
    if (body.organization_id) {
      const [o] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, body.organization_id))
        .limit(1);
      if (!o) throw Errors.badRequest("Unknown organization to link.");
    }

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) set.status = body.status;
    if (body.owner_staff_id !== undefined) set.ownerStaffId = body.owner_staff_id;
    if (body.organization_id !== undefined) set.organizationId = body.organization_id;

    const [updated] = await db.update(leads).set(set).where(eq(leads.id, id)).returning();

    const systemNotes: string[] = [];
    if (body.status !== undefined && body.status !== before.status) {
      systemNotes.push(`Status: ${before.status} → ${body.status}`);
    }
    if (body.owner_staff_id !== undefined && body.owner_staff_id !== before.ownerStaffId) {
      systemNotes.push(
        body.owner_staff_id
          ? body.owner_staff_id === staff.id
            ? `Claimed by ${staff.email}`
            : "Reassigned"
          : "Unassigned",
      );
    }
    for (const body_ of systemNotes) {
      await db
        .insert(leadNotes)
        .values({ id: newId("leadNote"), leadId: id, staffUserId: staff.id, kind: "system", body: body_ });
    }

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "lead.update",
      targetType: "lead",
      targetId: id,
      metadata: { ...body },
      ip: req.ip,
    });

    const ownerEmail = updated.ownerStaffId === staff.id ? staff.email : undefined;
    return serializeLead(updated, ownerEmail);
  });

  const noteBody = z.object({ body: z.string().trim().min(1).max(4000) });
  app.post("/v1/admin/leads/:id/notes", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff, "support");
    const { id } = req.params as { id: string };
    const { body } = parse(noteBody, req.body);

    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, id)).limit(1);
    if (!lead) throw Errors.notFound("Lead not found");

    const [note] = await db
      .insert(leadNotes)
      .values({ id: newId("leadNote"), leadId: id, staffUserId: staff.id, body, kind: "note" })
      .returning();
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "lead.note",
      targetType: "lead",
      targetId: id,
      ip: req.ip,
    });
    return serializeLeadNote(note, staff.email);
  });

  // --- Custom / enterprise plans (per-org bespoke economics) ---------------
  const customPlanBody = z.object({
    name: z.string().min(1).max(80),
    price_cents: z.coerce.number().int().min(0).max(100_000_000),
    interval: z.enum(BILLING_INTERVALS).default("month"),
    monthly_quota: z.coerce.number().int().min(0),
    allow_overage: z.boolean().default(true),
    overage_per_1000_cents: z.coerce.number().int().min(0).max(100_000).default(0),
    included_sub_tenants: z.coerce.number().int().min(-1).default(-1),
    seats: z.coerce.number().int().min(-1).default(-1),
    ai_credits: z.coerce.number().int().min(-1).default(-1),
    lead_id: z.string().optional(),
  });
  // Create or update an org's bespoke enterprise plan. Money/plan action →
  // superadmin only, audited. Puts the org on enterprise (feature unlocks) with
  // these economics, makes the plan real in Stripe, and — if a lead is linked —
  // converts that lead to a won customer. Economics take effect immediately.
  app.post("/v1/admin/orgs/:id/custom-plan", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const { id } = req.params as { id: string };
    const b = parse(customPlanBody, req.body);

    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");
    if (b.lead_id) {
      const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, b.lead_id)).limit(1);
      if (!lead) throw Errors.badRequest("Unknown lead to link.");
    }

    const values = {
      organizationId: id,
      leadId: b.lead_id ?? null,
      name: b.name,
      priceCents: b.price_cents,
      interval: b.interval,
      monthlyQuota: b.monthly_quota,
      allowOverage: b.allow_overage,
      overagePer1000Cents: b.overage_per_1000_cents,
      includedSubTenants: b.included_sub_tenants,
      seats: b.seats,
      aiCredits: b.ai_credits,
      active: true,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(customPlans)
      .values({ id: newId("customPlan"), ...values })
      .onConflictDoUpdate({ target: customPlans.organizationId, set: values })
      .returning();

    await db
      .update(organizations)
      .set({ plan: "enterprise", planStatus: "active", billingInterval: b.interval, updatedAt: new Date() })
      .where(eq(organizations.id, id));

    if (b.lead_id) {
      await db
        .update(leads)
        .set({ status: "won", organizationId: id, updatedAt: new Date() })
        .where(eq(leads.id, b.lead_id));
      await db.insert(leadNotes).values({
        id: newId("leadNote"),
        leadId: b.lead_id,
        staffUserId: staff.id,
        kind: "system",
        body: `Converted to customer — custom plan "${b.name}" created for ${org.name}.`,
      });
    }

    // Make the plan real + billable in Stripe (best-effort; economics already apply).
    let stripeSync: "synced" | "skipped" | "failed" = "skipped";
    try {
      const synced = await syncCustomPlanPrice(row);
      stripeSync = synced ? "synced" : "skipped";
    } catch (err) {
      req.log.error({ err }, "custom plan price sync to Stripe failed");
      stripeSync = "failed";
    }

    await refreshPlanCache(); // economics live immediately
    const [after] = await db.select().from(customPlans).where(eq(customPlans.id, row.id)).limit(1);

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "custom_plan.upsert",
      targetType: "organization",
      targetId: id,
      metadata: { ...b, stripe_sync: stripeSync },
      ip: req.ip,
    });
    return { ...serializeCustomPlan(after ?? row), stripe_sync: stripeSync };
  });

  // Provision billing for the custom plan (send-invoice subscription). Superadmin.
  app.post("/v1/admin/orgs/:id/custom-plan/bill", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const { id } = req.params as { id: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");
    const [cp] = await db.select().from(customPlans).where(eq(customPlans.organizationId, id)).limit(1);
    if (!cp || !cp.active) throw Errors.badRequest("No active custom plan for this org.");

    const result = await provisionCustomSubscription(org, cp);
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "custom_plan.bill",
      targetType: "organization",
      targetId: id,
      metadata: { ...result },
      ip: req.ip,
    });
    if (!result.provisioned) throw Errors.badRequest(result.reason ?? "Couldn't provision billing.");
    return { object: "custom_plan_billing", ...result };
  });

  // Deactivate the custom plan — the org reverts to the standard enterprise
  // economics (it stays on the enterprise tier). If the bespoke plan was billed as a
  // send-invoice subscription, that subscription is canceled + detached so billing
  // matches what's now enforced (no more invoicing the custom price). Superadmin, audited.
  app.post("/v1/admin/orgs/:id/custom-plan/deactivate", async (req) => {
    const staff = await requireStaff(req);
    requireStaffRole(staff);
    const { id } = req.params as { id: string };
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) throw Errors.notFound("Organization not found");
    const [cp] = await db.select().from(customPlans).where(eq(customPlans.organizationId, id)).limit(1);
    if (!cp) throw Errors.notFound("No custom plan for this org.");

    // Revert economics first — this is the core operation and must always succeed.
    // The org keeps plan="enterprise"; the resolver only honors ACTIVE custom plans,
    // so it now falls back to the standard enterprise catalog economics.
    await db.update(customPlans).set({ active: false, updatedAt: new Date() }).where(eq(customPlans.id, cp.id));
    await refreshPlanCache();

    // Then make billing consistent by canceling the custom subscription. Fail-soft like
    // the rest of the Stripe module — a Stripe hiccup must never block the deactivation
    // (the economics have already reverted above).
    let billing: "canceled" | "skipped" | "failed" = "skipped";
    let canceledSubId: string | null = null;
    try {
      const result = await cancelCustomSubscription(org, cp);
      billing = result.canceled ? "canceled" : "skipped";
      canceledSubId = result.subscription_id ?? null;
    } catch (err) {
      req.log.error({ err }, "custom plan subscription cancel on deactivate failed");
      billing = "failed";
    }

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "custom_plan.deactivate",
      targetType: "organization",
      targetId: id,
      metadata: { billing, subscription_id: canceledSubId },
      ip: req.ip,
    });
    return { object: "custom_plan", id: cp.id, active: false, billing, subscription_id: canceledSubId };
  });
}
