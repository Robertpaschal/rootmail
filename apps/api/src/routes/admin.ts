import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, verifyPassword } from "@rootmail/core";
import {
  auditEntries,
  db,
  type Message,
  memberships,
  messages,
  organizations,
  staffUsers,
  subTenants,
  usageRecords,
  users,
  workspaces,
} from "@rootmail/db";
import { serializeAudit } from "../lib/serialize";
import {
  createStaffSession,
  deleteStaffSession,
  requireStaff,
  serializeStaff,
  staffBearer,
} from "../lib/admin-auth";
import { currentPeriod } from "../lib/billing";
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
      .select({ email: users.email, name: users.name, role: memberships.role })
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
}
