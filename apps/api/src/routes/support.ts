import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, newId, sendSystemEmail, SUPPORT_TICKET_STATUSES } from "@rootmail/core";
import {
  db,
  organizations,
  type SupportMessage,
  supportMessages,
  type SupportTicket,
  supportTickets,
} from "@rootmail/db";
import { requireStaff, requireStaffPermission, writeStaffAudit } from "../lib/admin-auth";
import { loadOrg } from "../lib/features";
import { parse } from "../lib/validate";

function requireUser(req: FastifyRequest): { id: string; email: string; name: string | null } {
  if (!req.auth.user) throw Errors.forbidden("Support requires a signed-in user session.");
  return req.auth.user;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serializeTicket(t: SupportTicket) {
  return {
    object: "support_ticket" as const,
    id: t.id,
    organization_id: t.organizationId,
    email: t.email,
    name: t.name,
    subject: t.subject,
    status: t.status,
    handled_by_staff_id: t.handledByStaffId,
    last_message_at: t.lastMessageAt.toISOString(),
    created_at: t.createdAt.toISOString(),
  };
}

function serializeMessage(m: SupportMessage) {
  return {
    object: "support_message" as const,
    id: m.id,
    ticket_id: m.ticketId,
    author: m.author,
    staff_user_id: m.staffUserId,
    body: m.body,
    created_at: m.createdAt.toISOString(),
  };
}

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  // ---- Customer: file a support ticket (signed-in session) ----------------
  app.post("/v1/support", async (req) => {
    const user = requireUser(req);
    const org = await loadOrg(req);
    const body = parse(
      z.object({
        subject: z.string().trim().max(200).optional(),
        message: z.string().trim().min(1).max(8000),
      }),
      req.body,
    );
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: newId("supportTicket"),
        organizationId: org.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        subject: body.subject ?? null,
        status: "open",
      })
      .returning();
    await db.insert(supportMessages).values({
      id: newId("supportMessage"),
      ticketId: ticket.id,
      author: "customer",
      body: body.message,
    });
    return { ...serializeTicket(ticket), ticket_id: ticket.id };
  });

  // ---- Staff: support inbox (support.manage) ------------------------------
  app.get("/v1/admin/support", async (req) => {
    requireStaffPermission(await requireStaff(req), "support.manage");
    const status = (req.query as { status?: string }).status;
    const where: SQL | undefined =
      status === "open" || status === "closed" ? eq(supportTickets.status, status) : undefined;
    const tickets = await db
      .select({ t: supportTickets, orgName: organizations.name })
      .from(supportTickets)
      .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
      .where(where)
      .orderBy(desc(supportTickets.lastMessageAt))
      .limit(200);

    const ids = tickets.map((r) => r.t.id);
    const msgs = ids.length
      ? await db
          .select()
          .from(supportMessages)
          .where(inArray(supportMessages.ticketId, ids))
          .orderBy(asc(supportMessages.createdAt))
      : [];
    const byTicket = new Map<string, SupportMessage[]>();
    for (const m of msgs) {
      const arr = byTicket.get(m.ticketId) ?? [];
      arr.push(m);
      byTicket.set(m.ticketId, arr);
    }

    return {
      object: "list",
      data: tickets.map((r) => {
        const tm = byTicket.get(r.t.id) ?? [];
        const last = tm[tm.length - 1];
        return {
          ...serializeTicket(r.t),
          organization_name: r.orgName,
          message_count: tm.length,
          last_message: last
            ? { author: last.author, body: last.body.slice(0, 200), created_at: last.createdAt.toISOString() }
            : null,
        };
      }),
    };
  });

  app.get("/v1/admin/support/:id", async (req) => {
    requireStaffPermission(await requireStaff(req), "support.manage");
    const { id } = req.params as { id: string };
    const [row] = await db
      .select({ t: supportTickets, orgName: organizations.name })
      .from(supportTickets)
      .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (!row) throw Errors.notFound("Ticket not found");
    const messages = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt));
    return {
      ...serializeTicket(row.t),
      organization_name: row.orgName,
      messages: messages.map(serializeMessage),
    };
  });

  // Staff reply — records a staff message AND emails the customer the response.
  app.post("/v1/admin/support/:id/reply", async (req) => {
    const staff = await requireStaff(req);
    requireStaffPermission(staff, "support.manage");
    const { id } = req.params as { id: string };
    const { body: text } = parse(z.object({ body: z.string().trim().min(1).max(8000) }), req.body);
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) throw Errors.notFound("Ticket not found");

    const now = new Date();
    await db.insert(supportMessages).values({
      id: newId("supportMessage"),
      ticketId: id,
      author: "staff",
      staffUserId: staff.id,
      body: text,
    });
    await db
      .update(supportTickets)
      .set({ handledByStaffId: staff.id, lastMessageAt: now, updatedAt: now })
      .where(eq(supportTickets.id, id));

    const subject = ticket.subject ? `Re: ${ticket.subject}` : "Re: your rootmail support request";
    await sendSystemEmail({
      to: ticket.email,
      subject,
      html:
        `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` +
        `<hr><p style="color:#888;font-size:12px">You're receiving this because you contacted rootmail support. Just reply to this email to continue the conversation.</p>`,
      text: `${text}\n\n— rootmail support`,
    }).catch((err) => req.log.warn({ err }, "support reply email failed"));

    await writeStaffAudit({
      staffUserId: staff.id,
      action: "support.reply",
      targetType: "support_ticket",
      targetId: id,
      metadata: {},
      ip: req.ip,
    });
    return { ok: true };
  });

  app.post("/v1/admin/support/:id/status", async (req) => {
    const staff = await requireStaff(req);
    requireStaffPermission(staff, "support.manage");
    const { id } = req.params as { id: string };
    const { status } = parse(z.object({ status: z.enum(SUPPORT_TICKET_STATUSES) }), req.body);
    const [updated] = await db
      .update(supportTickets)
      .set({ status, handledByStaffId: staff.id, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    if (!updated) throw Errors.notFound("Ticket not found");
    await writeStaffAudit({
      staffUserId: staff.id,
      action: "support.status",
      targetType: "support_ticket",
      targetId: id,
      metadata: { status },
      ip: req.ip,
    });
    return serializeTicket(updated);
  });
}
