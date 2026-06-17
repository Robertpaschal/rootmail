import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, verifyPassword } from "@rootmail/core";
import {
  db,
  memberships,
  messages,
  organizations,
  staffUsers,
  subTenants,
  usageRecords,
  users,
  workspaces,
} from "@rootmail/db";
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
}
