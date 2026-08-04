import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { contactVariables, enqueueCampaignSend, Errors, newId, render } from "@rootmail/core";
import { audienceMembers, auditEntries, type Campaign, campaignOverrides, campaigns, contacts, db, listContacts, lists, messages, sequenceEnrollments, sequences, templates } from "@rootmail/db";
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

const previewQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

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

  // --- Pre-flight: what each recipient will actually receive ---------------
  // Before a campaign goes out, the sender should be able to step through their
  // audience and read each person's copy. This resolves EXACTLY what the worker
  // will: the A/B variant their tags select, and the variables their contact
  // record supplies. Read-only; it neither sends nor records anything.
  app.get("/v1/campaigns/:id/preview", async (req) => {
    const { id } = req.params as { id: string };
    const q = parse(previewQuery, req.query);
    const c = await getScoped(req, id);

    // Both are nullable (ON DELETE SET NULL), so a campaign whose template or
    // audience was deleted can't be previewed — say which, plainly.
    if (!c.templateId) throw Errors.badRequest("This campaign has no template — pick one before reviewing it.");
    if (!c.listId) throw Errors.badRequest("This campaign has no audience — pick one before reviewing it.");

    const [tpl] = await db.select().from(templates).where(eq(templates.id, c.templateId)).limit(1);
    if (!tpl) throw Errors.notFound("The campaign's template no longer exists");

    const defs = (c.variants ?? []).filter((v) => v.tag && v.template_id);
    const variantTemplates = new Map<string, typeof tpl>();
    if (defs.length > 0) {
      const rows = await db
        .select()
        .from(templates)
        .where(inArray(templates.id, [...new Set(defs.map((v) => v.template_id))]));
      for (const t of rows) if (t.workspaceId === c.workspaceId) variantTemplates.set(t.id, t);
    }

    // Same resolver the worker sends with, so the pre-flight shows the people
    // who will actually receive this — including for a rule-based audience,
    // which has no membership rows to join.
    const [audience] = await db.select().from(lists).where(eq(lists.id, c.listId)).limit(1);
    const all = audience
      ? await audienceMembers({
          id: audience.id,
          workspaceId: audience.workspaceId,
          subTenantId: audience.subTenantId,
          filter: audience.filter,
        })
      : [];

    const segment = c.segmentTag;
    const members = segment ? all.filter((m) => (m.tags ?? []).includes(segment)) : all;

    // A recipient whose copy was edited by hand gets that, verbatim.
    const overrides = new Map(
      (await db.select().from(campaignOverrides).where(eq(campaignOverrides.campaignId, c.id))).map((o) => [
        o.email,
        o,
      ]),
    );

    const data = members.slice(0, q.limit).map((m) => {
      // Same rule as the worker: the first variant whose tag they carry wins.
      const hit = defs.find((v) => (m.tags ?? []).includes(v.tag));
      const vTpl = hit ? variantTemplates.get(hit.template_id) : undefined;
      const useTpl = vTpl ?? tpl;
      const useSubject = vTpl ? (hit?.subject ?? vTpl.subject) : (c.subject ?? tpl.subject);
      const variables = contactVariables(m, m.email);
      const ov = overrides.get(m.email.toLowerCase());
      const rendered = render({
        subject: ov?.subject ?? useSubject,
        html: ov?.html ?? useTpl.html,
        // An edited copy has no separate text part — derive it from the HTML.
        text: ov?.html ? null : useTpl.text,
        variables,
      });
      return {
        object: "campaign_recipient" as const,
        email: m.email,
        name: m.name,
        tags: m.tags ?? [],
        variant_tag: hit?.tag ?? null,
        template_name: useTpl.name,
        edited: ov != null,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      };
    });

    return { object: "list", total: members.length, data };
  });

  // --- Edit one person's copy ---------------------------------------------
  // What you do when the pre-flight shows you something you don't like for one
  // recipient. Only meaningful before the campaign goes out, so it's refused
  // afterwards rather than silently having no effect.
  const overrideBody = z.object({
    email: z.string().email(),
    subject: z.string().min(1).max(500).optional(),
    html: z.string().min(1).optional(),
  });

  app.put("/v1/campaigns/:id/overrides", async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(req, "content.manage");
    const c = await getScoped(req, id);
    if (c.status !== "draft" && c.status !== "scheduled") {
      throw Errors.badRequest("This campaign has already gone out — its recipients' copies can't be changed.");
    }
    const body = parse(overrideBody, req.body);
    if (body.subject === undefined && body.html === undefined) {
      throw Errors.badRequest("Provide a subject, a body, or both.");
    }
    const email = body.email.trim().toLowerCase();

    const [existing] = await db
      .select()
      .from(campaignOverrides)
      .where(and(eq(campaignOverrides.campaignId, c.id), eq(campaignOverrides.email, email)))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(campaignOverrides)
        .set({
          subject: body.subject ?? existing.subject,
          html: body.html ?? existing.html,
          updatedAt: new Date(),
        })
        .where(eq(campaignOverrides.id, existing.id))
        .returning();
      return { object: "campaign_override", ...row };
    }

    const [row] = await db
      .insert(campaignOverrides)
      .values({
        id: newId("campaignOverride"),
        workspaceId: req.auth.workspace.id,
        campaignId: c.id,
        email,
        subject: body.subject ?? null,
        html: body.html ?? null,
      })
      .returning();
    return { object: "campaign_override", ...row };
  });

  app.delete("/v1/campaigns/:id/overrides", async (req) => {
    const { id } = req.params as { id: string };
    await requirePermission(req, "content.manage");
    const c = await getScoped(req, id);
    const { email } = parse(z.object({ email: z.string().email() }), req.query);
    await db
      .delete(campaignOverrides)
      .where(
        and(eq(campaignOverrides.campaignId, c.id), eq(campaignOverrides.email, email.trim().toLowerCase())),
      );
    return { object: "campaign_override", deleted: true };
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

  // Per-recipient engagement: every person the campaign reached, their status,
  // and exactly what they did (opened / clicked which link + when). Paged, most
  // engaged first, so "who's warming up" reads at a glance. Powers the campaign
  // detail's recipients table (and its real-time refresh while a send is live).
  app.get("/v1/campaigns/:id/recipients", async (req) => {
    const { id } = req.params as { id: string };
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const c = await getScoped(req, id);

    // Opens/clicks are audit-only (status stays "delivered"), so rank by the audit
    // trail: clicked > opened > delivered > sent > problem, then recency — the most
    // engaged people surface first.
    const engagementRank = sql<number>`case
      when count(*) filter (where ${auditEntries.event} = 'clicked') > 0 then 5
      when count(*) filter (where ${auditEntries.event} = 'opened') > 0 then 4
      when ${messages.status} = 'delivered' then 3
      when ${messages.status} = 'sent' then 2
      when ${messages.status} in ('bounced','complained','failed') then 1
      else 0 end`;

    const rows = await db
      .select({
        messageId: messages.id,
        email: messages.toEmail,
        name: contacts.name,
        status: messages.status,
        sentAt: messages.createdAt,
        // First open/click time + the first clicked URL, from the audit trail.
        openedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'opened')`,
        clickedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'clicked')`,
        clickedUrl: sql<string | null>`(array_agg(${auditEntries.metadata}->>'url') filter (where ${auditEntries.event} = 'clicked'))[1]`,
      })
      .from(messages)
      .leftJoin(contacts, eq(contacts.id, messages.toContactId))
      .leftJoin(auditEntries, eq(auditEntries.messageId, messages.id))
      .where(and(eq(messages.workspaceId, req.auth.workspace.id), eq(messages.campaignId, c.id)))
      .groupBy(messages.id, messages.toEmail, contacts.name, messages.status, messages.createdAt)
      .orderBy(desc(engagementRank), desc(messages.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.workspaceId, req.auth.workspace.id), eq(messages.campaignId, c.id)));

    return {
      object: "list",
      data: rows.map((r) => ({
        message_id: r.messageId,
        email: r.email,
        name: r.name,
        status: r.status,
        sent_at: r.sentAt?.toISOString() ?? null,
        opened_at: r.openedAt ? new Date(r.openedAt).toISOString() : null,
        clicked_at: r.clickedAt ? new Date(r.clickedAt).toISOString() : null,
        clicked_url: r.clickedUrl,
      })),
      total: cnt?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
    };
  });

  // Campaign → sequence: enroll the people who engaged (or didn't) into an
  // automated follow-up drip. This is the "campaigns work with sequences" flow —
  // send once, then let a sequence nurture whoever clicked / opened / went cold.
  app.post("/v1/campaigns/:id/follow-up", async (req, reply) => {
    await requirePermission(req, "content.manage");
    await requireFeature(req, "sequences");
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        sequence_id: z.string().min(1),
        segment: z.enum(["clicked", "opened", "not_opened", "all"]),
      }),
      req.body,
    );
    const c = await getScoped(req, id);
    const subTenantId = scopeOf(req);

    // The chosen sequence must be this workspace's.
    const [seq] = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.id, body.sequence_id), eq(sequences.workspaceId, req.auth.workspace.id)))
      .limit(1);
    if (!seq) throw Errors.notFound("Sequence not found");

    // The campaign's recipients + whether each opened/clicked, from the audit trail.
    const recips = await db
      .select({
        contactId: messages.toContactId,
        email: messages.toEmail,
        opened: sql<number>`count(*) filter (where ${auditEntries.event} = 'opened')`,
        clicked: sql<number>`count(*) filter (where ${auditEntries.event} = 'clicked')`,
      })
      .from(messages)
      .leftJoin(auditEntries, eq(auditEntries.messageId, messages.id))
      .where(and(eq(messages.workspaceId, req.auth.workspace.id), eq(messages.campaignId, c.id)))
      .groupBy(messages.toContactId, messages.toEmail);

    const match = recips.filter((r) => {
      if (!r.contactId) return false; // enrollment needs a contact record
      if (body.segment === "all") return true;
      if (body.segment === "clicked") return r.clicked > 0;
      if (body.segment === "opened") return r.opened > 0 || r.clicked > 0;
      return r.opened === 0 && r.clicked === 0; // not_opened
    });

    // Enroll each, skipping anyone already active in this sequence.
    let enrolled = 0;
    for (const r of match) {
      const [active] = await db
        .select({ id: sequenceEnrollments.id })
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, seq.id),
            eq(sequenceEnrollments.email, r.email.toLowerCase()),
            eq(sequenceEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (active) continue;
      await db.insert(sequenceEnrollments).values({
        id: newId("sequenceEnrollment"),
        sequenceId: seq.id,
        workspaceId: req.auth.workspace.id,
        subTenantId,
        contactId: r.contactId,
        email: r.email.toLowerCase(),
        status: "active",
        currentStep: 0,
        nextRunAt: new Date(),
      });
      enrolled += 1;
    }

    return reply.status(200).send({ object: "follow_up", sequence_id: seq.id, matched: match.length, enrolled });
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
