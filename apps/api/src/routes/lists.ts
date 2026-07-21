import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CONTACT_STAGES, env, Errors, newId } from "@rootmail/core";
import { contactEvents, contacts, db, type List, listContacts, lists, pendingWaitlist } from "@rootmail/db";
import { assertAudienceCapacity, assertContactCapacity } from "../lib/billing";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { findContact } from "../lib/queries";
import { serializeContact } from "../lib/serialize";
import { parse } from "../lib/validate";

// Lists are available on ALL plans (basic contact organization). Sending a
// campaign to a list is the Pro-gated bit — see routes/campaigns.ts.

function scopeOf(req: FastifyRequest): string | null {
  return req.auth.subTenant?.id ?? null;
}

function serialize(l: List, contactCount: number) {
  return {
    object: "contact_list",
    id: l.id,
    name: l.name,
    description: l.description,
    contacts: contactCount,
    // Public signup (audience growth): the hosted page + embed form settings.
    signup_enabled: l.signupEnabled,
    double_opt_in: l.doubleOptIn,
    signup_tag: l.signupTag,
    signup_redirect_url: l.signupRedirectUrl,
    created_at: l.createdAt.toISOString(),
  };
}

async function getScoped(req: FastifyRequest, id: string): Promise<List> {
  const subTenantId = scopeOf(req);
  const [l] = await db
    .select()
    .from(lists)
    .where(
      and(
        eq(lists.id, id),
        eq(lists.workspaceId, req.auth.workspace.id),
        subTenantId ? eq(lists.subTenantId, subTenantId) : isNull(lists.subTenantId),
      ),
    )
    .limit(1);
  if (!l) throw Errors.notFound(`List ${id} not found`);
  return l;
}

async function countOf(listId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(listContacts)
    .where(eq(listContacts.listId, listId));
  return row?.n ?? 0;
}

export async function listRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/lists", async (req) => {
    const subTenantId = scopeOf(req);
    const rows = await db
      .select({ list: lists, count: sql<number>`count(${listContacts.id})::int` })
      .from(lists)
      .leftJoin(listContacts, eq(listContacts.listId, lists.id))
      .where(
        and(
          eq(lists.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(lists.subTenantId, subTenantId) : isNull(lists.subTenantId),
        ),
      )
      .groupBy(lists.id)
      .orderBy(desc(lists.createdAt));
    return { object: "list", data: rows.map((r) => serialize(r.list, r.count)) };
  });

  app.post("/v1/lists", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const body = parse(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        // Seed the new audience with everyone carrying this tag (a "subset").
        from_tag: z.string().min(1).max(80).optional(),
      }),
      req.body,
    );
    // Audiences are a per-tier marketing dimension — enforce the count.
    await assertAudienceCapacity(await loadOrg(req));
    const [row] = await db
      .insert(lists)
      .values({
        id: newId("list"),
        workspaceId: req.auth.workspace.id,
        subTenantId: scopeOf(req),
        name: body.name,
        description: body.description ?? null,
      })
      .returning();

    let seeded = 0;
    if (body.from_tag) {
      const subTenantId = scopeOf(req);
      const members = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, req.auth.workspace.id),
            subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
            sql`${contacts.tags} @> ${JSON.stringify([body.from_tag])}::jsonb`,
          ),
        );
      for (let i = 0; i < members.length; i += 500) {
        const chunk = members.slice(i, i + 500);
        await db
          .insert(listContacts)
          .values(chunk.map((m) => ({ id: newId("listContact"), listId: row.id, contactId: m.id })))
          .onConflictDoNothing();
      }
      seeded = members.length;
    }
    return reply.status(201).send(serialize(row, seeded));
  });

  app.get("/v1/lists/:id", async (req) => {
    const { id } = req.params as { id: string };
    const l = await getScoped(req, id);
    return serialize(l, await countOf(l.id));
  });

  app.patch("/v1/lists/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        signup_enabled: z.boolean().optional(),
        double_opt_in: z.boolean().optional(),
        signup_tag: z.string().trim().max(60).nullable().optional(),
        signup_redirect_url: z.string().url().max(500).nullable().optional(),
      }),
      req.body,
    );
    const existing = await getScoped(req, id);
    const [updated] = await db
      .update(lists)
      .set({
        name: body.name ?? existing.name,
        description: body.description !== undefined ? body.description : existing.description,
        signupEnabled: body.signup_enabled ?? existing.signupEnabled,
        doubleOptIn: body.double_opt_in ?? existing.doubleOptIn,
        signupTag: body.signup_tag !== undefined ? body.signup_tag : existing.signupTag,
        signupRedirectUrl: body.signup_redirect_url !== undefined ? body.signup_redirect_url : existing.signupRedirectUrl,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, existing.id))
      .returning();
    return serialize(updated, await countOf(updated.id));
  });

  // --- Growth: subs vs unsubs by day + the waitlist, for the Grow panel ------
  app.get("/v1/lists/:id/growth", async (req) => {
    const { id } = req.params as { id: string };
    const list = await getScoped(req, id);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        day: sql<string>`to_char(${contactEvents.occurredAt}, 'YYYY-MM-DD')`,
        kind: contactEvents.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(contactEvents)
      .where(
        and(
          eq(contactEvents.workspaceId, req.auth.workspace.id),
          eq(contactEvents.listId, list.id),
          gte(contactEvents.occurredAt, since),
          inArray(contactEvents.kind, ["subscribed", "unsubscribed", "admitted"]),
        ),
      )
      .groupBy(sql`1`, contactEvents.kind);

    const byDay = new Map<string, { subscribed: number; unsubscribed: number }>();
    for (const r of rows) {
      const d = byDay.get(r.day) ?? { subscribed: 0, unsubscribed: 0 };
      if (r.kind === "unsubscribed") d.unsubscribed += r.n;
      else d.subscribed += r.n;
      byDay.set(r.day, d);
    }
    const days: { day: string; subscribed: number; unsubscribed: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      days.push({ day, ...(byDay.get(day) ?? { subscribed: 0, unsubscribed: 0 }) });
    }

    // People still waiting for contact room (kept, never lost).
    const org = await loadOrg(req);
    const pending = await pendingWaitlist(org.id, 500);
    const waitlisted = pending.filter((p) => p.listId === list.id).length;

    return {
      object: "list_growth",
      list_id: list.id,
      days,
      totals: {
        subscribed_30d: days.reduce((a, d) => a + d.subscribed, 0),
        unsubscribed_30d: days.reduce((a, d) => a + d.unsubscribed, 0),
      },
      waitlisted,
      // Ready-to-share growth surfaces (the API knows the public bases).
      hosted_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/subscribe/${list.id}`,
      subscribe_endpoint: `${env.PUBLIC_API_URL.replace(/\/$/, "")}/v1/subscribe`,
    };
  });

  app.delete("/v1/lists/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const l = await getScoped(req, id);
    await db.delete(lists).where(eq(lists.id, l.id));
    return { object: "contact_list", id: l.id, deleted: true };
  });

  // Distinct tags carried by this list's members, with how many members carry
  // each — feeds the campaign composer's segment + A/B pickers.
  app.get("/v1/lists/:id/tags", async (req) => {
    const { id } = req.params as { id: string };
    const l = await getScoped(req, id);
    const rows = (await db.execute(sql`
      select tag, count(*)::int as n
      from ${listContacts}
      join ${contacts} on ${contacts.id} = ${listContacts.contactId},
      lateral jsonb_array_elements_text(${contacts.tags}) as tag
      where ${listContacts.listId} = ${l.id}
      group by tag
      order by n desc, tag asc
      limit 100
    `)) as unknown as { tag: string; n: number }[];
    return {
      object: "list",
      data: rows.map((r) => ({ tag: r.tag, contacts: r.n })),
    };
  });

  // --- Membership ---------------------------------------------------------
  app.get("/v1/lists/:id/contacts", async (req) => {
    const { id } = req.params as { id: string };
    const l = await getScoped(req, id);
    const q = parse(
      z.object({
        q: z.string().max(200).optional(),
        stage: z.enum(CONTACT_STAGES).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );

    const base = [eq(listContacts.listId, l.id)];
    const filtered = [...base];
    if (q.q) {
      const needle = `%${q.q}%`;
      filtered.push(or(ilike(contacts.email, needle), ilike(contacts.name, needle))!);
    }
    if (q.stage) filtered.push(eq(contacts.stage, q.stage));

    const [rows, [cnt], stageRows] = await Promise.all([
      db
        .select({ contact: contacts })
        .from(listContacts)
        .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
        .where(and(...filtered))
        .orderBy(desc(listContacts.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(listContacts)
        .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
        .where(and(...filtered)),
      // The audience's true lifecycle mix (ignores the q/stage filter) — the "at a glance".
      db
        .select({ stage: contacts.stage, n: sql<number>`count(*)::int` })
        .from(listContacts)
        .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
        .where(and(...base))
        .groupBy(contacts.stage),
    ]);

    const stages = Object.fromEntries(CONTACT_STAGES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of stageRows) stages[r.stage] = (stages[r.stage] ?? 0) + r.n;

    return {
      object: "list",
      data: rows.map((r) => serializeContact(r.contact)),
      total: cnt?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
      stages,
    };
  });

  // Add a contact by id or email (creating the contact if the email is new).
  app.post("/v1/lists/:id/contacts", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(z.object({ email: z.string().email().optional(), contact_id: z.string().optional() }), req.body);
    const l = await getScoped(req, id);
    const subTenantId = scopeOf(req);

    let contactId = body.contact_id ?? null;
    if (!contactId) {
      if (!body.email) throw Errors.validation("Provide `email` or `contact_id`.");
      const found = await findContact(req.auth.workspace.id, subTenantId, body.email);
      if (found) contactId = found.id;
      else {
        const [created] = await db
          .insert(contacts)
          .values({
            id: newId("contact"),
            workspaceId: req.auth.workspace.id,
            subTenantId,
            email: body.email,
            status: "active",
          })
          .returning();
        contactId = created.id;
      }
    } else {
      const [c] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, req.auth.workspace.id)))
        .limit(1);
      if (!c) throw Errors.notFound(`Contact ${contactId} not found`);
    }

    // Audience growth is what the marketing wing prices — gate on the bracket.
    await assertContactCapacity(await loadOrg(req), 1);
    await db
      .insert(listContacts)
      .values({ id: newId("listContact"), listId: l.id, contactId })
      .onConflictDoNothing();
    return reply.status(201).send({ object: "list_contact", list_id: l.id, contact_id: contactId });
  });

  app.delete("/v1/lists/:id/contacts/:contactId", async (req) => {
    await requirePermission(req, "content.manage");
    const { id, contactId } = req.params as { id: string; contactId: string };
    const l = await getScoped(req, id);
    await db
      .delete(listContacts)
      .where(and(eq(listContacts.listId, l.id), eq(listContacts.contactId, contactId)));
    return { object: "list_contact", list_id: l.id, contact_id: contactId, deleted: true };
  });
}
