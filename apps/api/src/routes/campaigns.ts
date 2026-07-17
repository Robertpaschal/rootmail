import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { enqueueCampaignSend, Errors, newId } from "@rootmail/core";
import { type Campaign, campaigns, contacts, db, listContacts, lists, messages, templates } from "@rootmail/db";
import { assertContactCapacity, assertEmailVerified, assertMarketingSendCapacity } from "../lib/billing";
import { loadOrg, requireFeature } from "../lib/features";
import { messageFunnel } from "../lib/funnel";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

/** Validate that referenced list/template(s) belong to the workspace — so a bad
 * id returns a clean 404 instead of a raw foreign-key error. */
async function validateRefs(
  req: FastifyRequest,
  listId?: string | null,
  templateId?: string | null,
  variantTemplateIds: string[] = [],
): Promise<void> {
  if (listId) {
    const [l] = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, listId), eq(lists.workspaceId, req.auth.workspace.id)))
      .limit(1);
    if (!l) throw Errors.notFound(`List ${listId} not found`);
  }
  for (const tid of new Set([templateId, ...variantTemplateIds].filter((x): x is string => !!x))) {
    const [t] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, tid), eq(templates.workspaceId, req.auth.workspace.id)))
      .limit(1);
    if (!t) throw Errors.notFound(`Template ${tid} not found`);
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
    segment_tag: c.segmentTag,
    variants: c.variants ?? [],
    status: c.status,
    scheduled_at: c.scheduledAt?.toISOString() ?? null,
    sent_at: c.sentAt?.toISOString() ?? null,
    stats: c.stats,
    created_at: c.createdAt.toISOString(),
  };
}

const variantBody = z.object({
  tag: z.string().min(1).max(80),
  template_id: z.string().min(1),
  subject: z.string().max(300).optional().nullable(),
});

const createBody = z.object({
  name: z.string().min(1).max(120),
  list_id: z.string().optional(),
  template_id: z.string().optional(),
  subject: z.string().optional(),
  from_email: z.string().email().optional(),
  // Only send to list members carrying this tag (null/absent = the whole list).
  segment_tag: z.string().min(1).max(80).optional().nullable(),
  // Tag-targeted A/B variants; capped so a campaign stays reviewable.
  variants: z.array(variantBody).max(4).optional(),
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
    await validateRefs(req, body.list_id, body.template_id, (body.variants ?? []).map((v) => v.template_id));
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
        segmentTag: body.segment_tag ?? null,
        variants: body.variants ?? [],
      })
      .returning();
    return reply.status(201).send(serialize(row));
  });

  app.get("/v1/campaigns/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serialize(await getScoped(req, id));
  });

  // Per-campaign engagement: the sent → delivered → opened → clicked funnel over
  // this campaign's own messages, same recipe (and shape) as /v1/analytics.
  app.get("/v1/campaigns/:id/analytics", async (req) => {
    const { id } = req.params as { id: string };
    const c = await getScoped(req, id);
    const stats = await messageFunnel([
      eq(messages.workspaceId, req.auth.workspace.id),
      eq(messages.campaignId, c.id),
    ]);
    return { object: "campaign_analytics", campaign_id: c.id, ...stats };
  });

  app.patch("/v1/campaigns/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(createBody.partial(), req.body);
    const existing = await getScoped(req, id);
    if (existing.status === "sending" || existing.status === "sent") {
      throw Errors.conflict(`Can't edit a campaign that's ${existing.status}`);
    }
    await validateRefs(req, body.list_id, body.template_id, (body.variants ?? []).map((v) => v.template_id));
    const [updated] = await db
      .update(campaigns)
      .set({
        name: body.name ?? existing.name,
        listId: body.list_id !== undefined ? body.list_id : existing.listId,
        templateId: body.template_id !== undefined ? body.template_id : existing.templateId,
        subject: body.subject !== undefined ? body.subject : existing.subject,
        fromEmail: body.from_email !== undefined ? body.from_email : existing.fromEmail,
        segmentTag: body.segment_tag !== undefined ? body.segment_tag : existing.segmentTag,
        variants: body.variants !== undefined ? body.variants : existing.variants,
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
    // Anti-abuse: a live campaign blast requires a verified account owner, an
    // audience within the chosen contact size, and enough marketing send volume for
    // the batch (the monthly + daily caps scale with contact size × the tier).
    const liveOrg = req.auth.mode === "live" ? await loadOrg(req) : null;
    if (liveOrg) {
      await assertEmailVerified(liveOrg);
      await assertContactCapacity(liveOrg, 0);
    }
    const { id } = req.params as { id: string };
    const body = parse(z.object({ scheduled_at: z.string().datetime().optional() }), req.body ?? {});
    const c = await getScoped(req, id);
    if (!c.listId || !c.templateId) {
      throw Errors.badRequest("A campaign needs both a list and a template before sending.");
    }
    if (c.status === "sending" || c.status === "sent") {
      throw Errors.conflict(`Campaign is already ${c.status}.`);
    }

    // Segmented campaigns only count members carrying the tag (jsonb containment).
    const [cnt] = c.segmentTag
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(listContacts)
          .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
          .where(
            and(
              eq(listContacts.listId, c.listId),
              sql`${contacts.tags} @> ${JSON.stringify([c.segmentTag])}::jsonb`,
            ),
          )
      : await db
          .select({ n: sql<number>`count(*)::int` })
          .from(listContacts)
          .where(eq(listContacts.listId, c.listId));
    const recipients = cnt?.n ?? 0;

    // The whole batch must fit the marketing send allowance (monthly + today).
    if (liveOrg) await assertMarketingSendCapacity(liveOrg, recipients);

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
