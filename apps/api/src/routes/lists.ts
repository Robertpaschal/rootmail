import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, newId } from "@rootmail/core";
import { contacts, db, type List, listContacts, lists } from "@rootmail/db";
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
    const body = parse(z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(500).nullable().optional() }), req.body);
    const existing = await getScoped(req, id);
    const [updated] = await db
      .update(lists)
      .set({
        name: body.name ?? existing.name,
        description: body.description !== undefined ? body.description : existing.description,
        updatedAt: new Date(),
      })
      .where(eq(lists.id, existing.id))
      .returning();
    return serialize(updated, await countOf(updated.id));
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
    const rows = await db
      .select({ contact: contacts })
      .from(listContacts)
      .innerJoin(contacts, eq(contacts.id, listContacts.contactId))
      .where(eq(listContacts.listId, l.id))
      .orderBy(desc(listContacts.createdAt));
    return { object: "list", data: rows.map((r) => serializeContact(r.contact)) };
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
