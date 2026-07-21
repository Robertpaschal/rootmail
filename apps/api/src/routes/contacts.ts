import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONTACT_STAGES, CONTACT_STATUSES, Errors, newId, verifyUnsubscribeToken } from "@rootmail/core";
import { auditEntries, contactEvents, contactNotes, contacts, db, emitContactEvent, listContacts, lists, messages, suppressions } from "@rootmail/db";
import { requirePermission } from "../lib/permissions";
import { addSuppression, findContact, isSuppressed } from "../lib/queries";
import { evaluateTriggers, exitEnrollments } from "../lib/sequence-triggers";
import { serializeContact } from "../lib/serialize";
import { escapeHtml, unsubPage } from "../lib/unsub-page";
import { parse } from "../lib/validate";


const upsertBody = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
});

const emailBody = z.object({ email: z.string().email() });

const browseQuery = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(80).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  // --- Browse (paged; search + tag/status filters) --------------------------
  // The workspace's people in one place — powers the dashboard's Audience hub
  // and gives API users a way to page through contacts (`GET /v1/contacts/:email`
  // remains the point lookup).
  app.get("/v1/contacts", async (req) => {
    const q = parse(browseQuery, req.query);
    const subTenantId = req.auth.subTenant?.id ?? null;

    const where: SQL[] = [
      eq(contacts.workspaceId, req.auth.workspace.id),
      subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
    ];
    if (q.q) {
      const needle = `%${q.q}%`;
      where.push(or(ilike(contacts.email, needle), ilike(contacts.name, needle))!);
    }
    if (q.tag) where.push(sql`${contacts.tags} @> ${JSON.stringify([q.tag])}::jsonb`);
    if (q.status) where.push(eq(contacts.status, q.status));
    if (q.stage) where.push(eq(contacts.stage, q.stage));

    const [rows, [cnt]] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(and(...where))
        .orderBy(desc(contacts.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(...where)),
    ]);

    return {
      object: "list",
      data: rows.map(serializeContact),
      total: cnt?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
    };
  });

  // --- Tags (the workspace's subsets, with how many people carry each) ------
  app.get("/v1/contacts/tags", async (req) => {
    const subTenantId = req.auth.subTenant?.id ?? null;
    const rows = (await db.execute(sql`
      select tag, count(*)::int as n
      from ${contacts}, lateral jsonb_array_elements_text(${contacts.tags}) as tag
      where ${contacts.workspaceId} = ${req.auth.workspace.id}
        and ${subTenantId ? sql`${contacts.subTenantId} = ${subTenantId}` : sql`${contacts.subTenantId} is null`}
      group by tag
      order by n desc, tag asc
      limit 100
    `)) as unknown as { tag: string; n: number }[];
    return { object: "list", data: rows.map((r) => ({ tag: r.tag, contacts: r.n })) };
  });

  // --- Lifecycle pipeline: how many people sit at each stage ----------------
  app.get("/v1/contacts/stages", async (req) => {
    const subTenantId = req.auth.subTenant?.id ?? null;
    const rows = await db
      .select({ stage: contacts.stage, n: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
        ),
      )
      .groupBy(contacts.stage);
    const counts = Object.fromEntries(CONTACT_STAGES.map((s) => [s, 0])) as Record<string, number>;
    let total = 0;
    for (const r of rows) {
      counts[r.stage] = (counts[r.stage] ?? 0) + r.n;
      total += r.n;
    }
    return { object: "contact_stages", total, stages: counts };
  });
  // --- Upsert -------------------------------------------------------------
  app.post("/v1/contacts", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const body = parse(upsertBody, req.body);
    const { workspace, subTenant } = req.auth;
    const subTenantId = subTenant?.id ?? null;

    const existing = await findContact(workspace.id, subTenantId, body.email);
    if (existing) {
      const [updated] = await db
        .update(contacts)
        .set({
          name: body.name ?? existing.name,
          phone: body.phone ?? existing.phone,
          tags: body.tags ?? existing.tags,
          metadata: body.metadata ?? existing.metadata,
          status: body.status ?? existing.status,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, existing.id))
        .returning();
      void evaluateTriggers(
        workspace.id,
        subTenantId,
        { id: updated.id, email: updated.email, tags: updated.tags },
        { created: false },
      );
      return reply.status(200).send(serializeContact(updated));
    }

    const [row] = await db
      .insert(contacts)
      .values({
        id: newId("contact"),
        workspaceId: workspace.id,
        subTenantId,
        email: body.email,
        name: body.name ?? null,
        phone: body.phone ?? null,
        tags: body.tags ?? [],
        metadata: body.metadata ?? {},
        status: body.status ?? "active",
      })
      .returning();
    void evaluateTriggers(
      workspace.id,
      subTenantId,
      { id: row.id, email: row.email, tags: row.tags },
      { created: true },
    );
    return reply.status(201).send(serializeContact(row));
  });

  // --- Retrieve by email --------------------------------------------------
  app.get("/v1/contacts/:email", async (req) => {
    const email = decodeURIComponent((req.params as { email: string }).email);
    const contact = await findContact(req.auth.workspace.id, req.auth.subTenant?.id ?? null, email);
    if (!contact) throw Errors.notFound(`Contact ${email} not found`);
    return serializeContact(contact);
  });

  // --- Unsubscribe --------------------------------------------------------
  app.post("/v1/contacts/unsubscribe", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const body = parse(emailBody, req.body);
    const { workspace, subTenant } = req.auth;
    const subTenantId = subTenant?.id ?? null;

    const existing = await findContact(workspace.id, subTenantId, body.email);
    if (existing) {
      await db
        .update(contacts)
        .set({ status: "unsubscribed", updatedAt: new Date() })
        .where(eq(contacts.id, existing.id));
    }
    await addSuppression(workspace.id, subTenantId, body.email, "unsubscribe", null, "api");
    void exitEnrollments(workspace.id, body.email, "unsubscribed");
    void emitContactEvent({
      workspaceId: workspace.id,
      subTenantId,
      contactId: existing?.id ?? null,
      email: body.email,
      kind: "unsubscribed",
      metadata: { source: "api" },
    });

    return reply.status(200).send({ ok: true, email: body.email, status: "unsubscribed" });
  });

  // --- Suppression check --------------------------------------------------
  app.get("/v1/suppressions/check", async (req) => {
    const q = parse(emailBody, req.query);
    const suppressed = await isSuppressed(req.auth.workspace.id, req.auth.subTenant?.id ?? null, q.email);
    return { email: q.email, suppressed };
  });

  // --- One-click unsubscribe (PUBLIC; the {{unsubscribe_url}} link target) --
  // GET shows a confirmation page; the side effect only happens on the
  // &confirm=1 step, so email-client link prefetchers can't auto-unsubscribe.
  // The token is HMAC-signed, so it can't be forged or enumerated.
  app.get("/v1/unsubscribe", async (req, reply) => {
    const { token, confirm } = req.query as { token?: string; confirm?: string };
    const payload = token ? verifyUnsubscribeToken(token) : null;
    if (!payload) {
      return reply
        .type("text/html")
        .code(400)
        .send(unsubPage("Invalid link", "<p>This unsubscribe link is invalid or has expired.</p>"));
    }

    if (confirm === "1") {
      const existing = await findContact(payload.w, payload.s ?? null, payload.e);
      if (existing) {
        await db
          .update(contacts)
          .set({ status: "unsubscribed", updatedAt: new Date() })
          .where(eq(contacts.id, existing.id));
      }
      await addSuppression(payload.w, payload.s ?? null, payload.e, "unsubscribe", null, "unsubscribe_link");
      void exitEnrollments(payload.w, payload.e, "unsubscribed");
      void emitContactEvent({
        workspaceId: payload.w,
        subTenantId: payload.s ?? null,
        contactId: existing?.id ?? null,
        email: payload.e,
        kind: "unsubscribed",
        metadata: { source: "unsubscribe_link" },
      });
      return reply
        .type("text/html")
        .send(unsubPage("Unsubscribed", "<p>You've been unsubscribed and won't receive further emails.</p>"));
    }

    const confirmHref = `/v1/unsubscribe?token=${encodeURIComponent(token!)}&confirm=1`;
    return reply.type("text/html").send(
      unsubPage(
        "Unsubscribe",
        `<p>Unsubscribe <strong>${escapeHtml(payload.e)}</strong> from these emails?</p>` +
          `<p><a class="btn" href="${confirmHref}">Confirm unsubscribe</a></p>`,
      ),
    );
  });

  // RFC 8058 one-click unsubscribe: mailbox providers POST to the List-Unsubscribe
  // URL when the user hits their native "Unsubscribe" button. Must act immediately
  // with NO confirmation step (that's the spec) — the HMAC-signed token is the
  // authorization. Same effects as the confirmed GET above.
  app.post("/v1/unsubscribe", async (req, reply) => {
    const { token } = req.query as { token?: string };
    const payload = token ? verifyUnsubscribeToken(token) : null;
    if (!payload) return reply.code(400).send({ ok: false, error: "invalid token" });

    const existing = await findContact(payload.w, payload.s ?? null, payload.e);
    if (existing) {
      await db
        .update(contacts)
        .set({ status: "unsubscribed", updatedAt: new Date() })
        .where(eq(contacts.id, existing.id));
    }
    await addSuppression(payload.w, payload.s ?? null, payload.e, "unsubscribe", null, "one_click");
    void exitEnrollments(payload.w, payload.e, "unsubscribed");
    void emitContactEvent({
      workspaceId: payload.w,
      subTenantId: payload.s ?? null,
      contactId: existing?.id ?? null,
      email: payload.e,
      kind: "unsubscribed",
      metadata: { source: "one_click" },
    });
    return reply.send({ ok: true });
  });

  // ==========================================================================
  // Contact CRM — the customer-relationship surface behind the Audience hub.
  // A contact is a real profile: edit it, tag it, note it, move it between
  // audiences, unsubscribe/resubscribe it, and read its whole lifecycle.
  // Routes live under /v1/contacts/id/:id (the legacy /v1/contacts/:email
  // lookup stays for API compatibility).
  // ==========================================================================

  async function getContactById(req: Parameters<typeof requirePermission>[0], id: string) {
    const subTenantId = req.auth.subTenant?.id ?? null;
    const [c] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(contacts.subTenantId, subTenantId) : isNull(contacts.subTenantId),
        ),
      )
      .limit(1);
    if (!c) throw Errors.notFound(`Contact ${id} not found`);
    return c;
  }

  // --- Full profile: audiences, notes, lifecycle events, recent emails ------
  app.get("/v1/contacts/id/:id", async (req) => {
    const { id } = req.params as { id: string };
    const c = await getContactById(req, id);

    const [memberships, notes, events, recentMessages, suppressed] = await Promise.all([
      db
        .select({ id: lists.id, name: lists.name })
        .from(listContacts)
        .innerJoin(lists, eq(lists.id, listContacts.listId))
        .where(eq(listContacts.contactId, c.id)),
      db
        .select({ id: contactNotes.id, body: contactNotes.body, authorUserId: contactNotes.authorUserId, createdAt: contactNotes.createdAt })
        .from(contactNotes)
        .where(eq(contactNotes.contactId, c.id))
        .orderBy(desc(contactNotes.createdAt))
        .limit(100),
      db
        .select({ id: contactEvents.id, kind: contactEvents.kind, listId: contactEvents.listId, metadata: contactEvents.metadata, occurredAt: contactEvents.occurredAt })
        .from(contactEvents)
        .where(eq(contactEvents.contactId, c.id))
        .orderBy(desc(contactEvents.occurredAt))
        .limit(50),
      db
        .select({ id: messages.id, subject: messages.subject, status: messages.status, type: messages.type, campaignId: messages.campaignId, sequenceId: messages.sequenceId, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.workspaceId, req.auth.workspace.id), eq(messages.toContactId, c.id)))
        .orderBy(desc(messages.createdAt))
        .limit(20),
      isSuppressed(req.auth.workspace.id, req.auth.subTenant?.id ?? null, c.email),
    ]);

    // Engagement times for the listed sends, from the audit trail.
    const mids = recentMessages.map((m) => m.id);
    const engagement = new Map<string, { openedAt: Date | null; clickedAt: Date | null }>();
    if (mids.length) {
      const eng = await db
        .select({
          messageId: auditEntries.messageId,
          openedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'opened')`,
          clickedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'clicked')`,
        })
        .from(auditEntries)
        .where(inArray(auditEntries.messageId, mids))
        .groupBy(auditEntries.messageId);
      for (const e of eng) if (e.messageId) engagement.set(e.messageId, { openedAt: e.openedAt, clickedAt: e.clickedAt });
    }

    const listNameById = new Map(memberships.map((m) => [m.id, m.name]));
    return {
      ...serializeContact(c),
      suppressed,
      lists: memberships.map((m) => ({ id: m.id, name: m.name })),
      notes: notes.map((n) => ({ id: n.id, body: n.body, author_user_id: n.authorUserId, created_at: n.createdAt })),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        list_id: e.listId,
        list_name: e.listId ? (listNameById.get(e.listId) ?? null) : null,
        metadata: e.metadata,
        occurred_at: e.occurredAt,
      })),
      recent_messages: recentMessages.map((m) => ({
        id: m.id,
        subject: m.subject,
        status: m.status,
        kind: m.campaignId ? "campaign" : m.sequenceId ? "sequence" : m.type,
        sent_at: m.createdAt,
        opened_at: engagement.get(m.id)?.openedAt ?? null,
        clicked_at: engagement.get(m.id)?.clickedAt ?? null,
      })),
    };
  });

  // --- Edit the profile (and lifecycle status) ------------------------------
  app.patch("/v1/contacts/id/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(
      z.object({
        name: z.string().trim().max(120).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
        metadata: z.record(z.unknown()).optional(),
        status: z.enum(["active", "unsubscribed"]).optional(),
        stage: z.enum(CONTACT_STAGES).optional(),
      }),
      req.body,
    );
    const c = await getContactById(req, id);
    const subTenantId = req.auth.subTenant?.id ?? null;

    const [updated] = await db
      .update(contacts)
      .set({
        name: body.name !== undefined ? body.name : c.name,
        phone: body.phone !== undefined ? body.phone : c.phone,
        tags: body.tags ?? c.tags,
        metadata: body.metadata ?? c.metadata,
        status: body.status ?? c.status,
        stage: body.stage ?? c.stage,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, c.id))
      .returning();

    // Escalations/de-escalations land on the timeline (from → to).
    if (body.stage && body.stage !== c.stage) {
      void emitContactEvent({
        workspaceId: req.auth.workspace.id,
        subTenantId,
        contactId: c.id,
        email: c.email,
        kind: "stage_changed",
        metadata: { from: c.stage, to: body.stage },
      });
    }

    // Lifecycle transitions carry their real side effects, same as every other door.
    if (body.status === "unsubscribed" && c.status !== "unsubscribed") {
      await addSuppression(req.auth.workspace.id, subTenantId, c.email, "unsubscribe", null, "crm");
      void exitEnrollments(req.auth.workspace.id, c.email, "unsubscribed");
      void emitContactEvent({
        workspaceId: req.auth.workspace.id,
        subTenantId,
        contactId: c.id,
        email: c.email,
        kind: "unsubscribed",
        metadata: { source: "crm" },
      });
    } else if (body.status === "active" && c.status !== "active") {
      // Resubscribe: clear the unsubscribe suppression so sends flow again.
      await db
        .delete(suppressions)
        .where(
          and(
            eq(suppressions.workspaceId, req.auth.workspace.id),
            subTenantId ? eq(suppressions.subTenantId, subTenantId) : isNull(suppressions.subTenantId),
            eq(suppressions.email, c.email),
            eq(suppressions.reason, "unsubscribe"),
          ),
        );
      void emitContactEvent({
        workspaceId: req.auth.workspace.id,
        subTenantId,
        contactId: c.id,
        email: c.email,
        kind: "subscribed",
        metadata: { source: "crm", resubscribed: true },
      });
    }

    // New tags can enroll into tag-triggered sequences — the CRM's automation hook.
    if (body.tags) {
      const added = body.tags.filter((t) => !(c.tags ?? []).includes(t));
      if (added.length > 0) {
        void evaluateTriggers(req.auth.workspace.id, subTenantId, { id: c.id, email: c.email, tags: body.tags }, { created: false });
      }
    }

    return serializeContact(updated);
  });

  // --- Delete (memberships + notes cascade; lifecycle events keep the email) --
  app.delete("/v1/contacts/id/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const c = await getContactById(req, id);
    await db.delete(contacts).where(eq(contacts.id, c.id));
    return { object: "contact", id: c.id, deleted: true };
  });

  // --- Notes ----------------------------------------------------------------
  app.post("/v1/contacts/id/:id/notes", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const { id } = req.params as { id: string };
    const body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    const c = await getContactById(req, id);
    const [note] = await db
      .insert(contactNotes)
      .values({
        id: newId("contactNote"),
        workspaceId: req.auth.workspace.id,
        contactId: c.id,
        authorUserId: req.auth.user?.id ?? null,
        body: body.body,
      })
      .returning();
    return reply.status(201).send({ id: note.id, body: note.body, author_user_id: note.authorUserId, created_at: note.createdAt });
  });

  app.delete("/v1/contacts/id/:id/notes/:noteId", async (req) => {
    await requirePermission(req, "content.manage");
    const { id, noteId } = req.params as { id: string; noteId: string };
    const c = await getContactById(req, id);
    await db.delete(contactNotes).where(and(eq(contactNotes.id, noteId), eq(contactNotes.contactId, c.id)));
    return { object: "contact_note", id: noteId, deleted: true };
  });
}
