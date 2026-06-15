import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { enqueueCampaignSend, Errors, newId } from "@rootmail/core";
import { type Campaign, campaigns, db, listContacts, lists, templates } from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

/** Validate that referenced list/template belong to the workspace — so a bad
 * id returns a clean 404 instead of a raw foreign-key error. */
async function validateRefs(
  req: FastifyRequest,
  listId?: string | null,
  templateId?: string | null,
): Promise<void> {
  if (listId) {
    const [l] = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, listId), eq(lists.workspaceId, req.auth.workspace.id)))
      .limit(1);
    if (!l) throw Errors.notFound(`List ${listId} not found`);
  }
  if (templateId) {
    const [t] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.workspaceId, req.auth.workspace.id)))
      .limit(1);
    if (!t) throw Errors.notFound(`Template ${templateId} not found`);
  }
}

function scopeOf(req: FastifyRequest): string | null {
  return req.auth.subTenant?.id ?? null;
}

function serialize(c: Campaign) {
  return {
    object: "campaign",
    id: c.id,
    name: c.name,
    list_id: c.listId,
    template_id: c.templateId,
    subject: c.subject,
    from_email: c.fromEmail,
    status: c.status,
    scheduled_at: c.scheduledAt?.toISOString() ?? null,
    sent_at: c.sentAt?.toISOString() ?? null,
    stats: c.stats,
    created_at: c.createdAt.toISOString(),
  };
}

const createBody = z.object({
  name: z.string().min(1).max(120),
  list_id: z.string().optional(),
  template_id: z.string().optional(),
  subject: z.string().optional(),
  from_email: z.string().email().optional(),
});

async function getScoped(req: FastifyRequest, id: string): Promise<Campaign> {
  const subTenantId = scopeOf(req);
  const [c] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        eq(campaigns.workspaceId, req.auth.workspace.id),
        subTenantId ? eq(campaigns.subTenantId, subTenantId) : isNull(campaigns.subTenantId),
      ),
    )
    .limit(1);
  if (!c) throw Errors.notFound(`Campaign ${id} not found`);
  return c;
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  // Sending bulk campaigns is a Pro+ capability.
  app.addHook("preHandler", async (req) => {
    await requireFeature(req, "campaigns");
  });

  app.get("/v1/campaigns", async (req) => {
    const subTenantId = scopeOf(req);
    const rows = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(campaigns.subTenantId, subTenantId) : isNull(campaigns.subTenantId),
        ),
      )
      .orderBy(desc(campaigns.createdAt));
    return { object: "list", data: rows.map(serialize) };
  });

  app.post("/v1/campaigns", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const body = parse(createBody, req.body);
    await validateRefs(req, body.list_id, body.template_id);
    const [row] = await db
      .insert(campaigns)
      .values({
        id: newId("campaign"),
        workspaceId: req.auth.workspace.id,
        subTenantId: scopeOf(req),
        name: body.name,
        listId: body.list_id ?? null,
        templateId: body.template_id ?? null,
        subject: body.subject ?? null,
        fromEmail: body.from_email ?? null,
      })
      .returning();
    return reply.status(201).send(serialize(row));
  });

  app.get("/v1/campaigns/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serialize(await getScoped(req, id));
  });

  app.patch("/v1/campaigns/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(createBody.partial(), req.body);
    const existing = await getScoped(req, id);
    if (existing.status === "sending" || existing.status === "sent") {
      throw Errors.conflict(`Can't edit a campaign that's ${existing.status}`);
    }
    await validateRefs(req, body.list_id, body.template_id);
    const [updated] = await db
      .update(campaigns)
      .set({
        name: body.name ?? existing.name,
        listId: body.list_id !== undefined ? body.list_id : existing.listId,
        templateId: body.template_id !== undefined ? body.template_id : existing.templateId,
        subject: body.subject !== undefined ? body.subject : existing.subject,
        fromEmail: body.from_email !== undefined ? body.from_email : existing.fromEmail,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, existing.id))
      .returning();
    return serialize(updated);
  });

  app.delete("/v1/campaigns/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const c = await getScoped(req, id);
    await db.delete(campaigns).where(eq(campaigns.id, c.id));
    return { object: "campaign", id: c.id, deleted: true };
  });

  // --- Send (or schedule) -------------------------------------------------
  app.post("/v1/campaigns/:id/send", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(z.object({ scheduled_at: z.string().datetime().optional() }), req.body ?? {});
    const c = await getScoped(req, id);
    if (!c.listId || !c.templateId) {
      throw Errors.badRequest("A campaign needs both a list and a template before sending.");
    }
    if (c.status === "sending" || c.status === "sent") {
      throw Errors.conflict(`Campaign is already ${c.status}.`);
    }

    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(listContacts)
      .where(eq(listContacts.listId, c.listId));
    const recipients = cnt?.n ?? 0;

    const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
    const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

    const [updated] = await db
      .update(campaigns)
      .set({
        status: delayMs > 0 ? "scheduled" : "sending",
        scheduledAt,
        stats: { recipients, sent: 0, suppressed: 0, failed: 0 },
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, c.id))
      .returning();

    await enqueueCampaignSend({ campaignId: c.id, workspaceId: req.auth.workspace.id }, { delayMs });
    return serialize(updated);
  });
}
