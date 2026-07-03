import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONTACT_STATUSES, Errors, newId, verifyUnsubscribeToken } from "@rootmail/core";
import { contacts, db } from "@rootmail/db";
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

export async function contactRoutes(app: FastifyInstance): Promise<void> {
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
    return reply.send({ ok: true });
  });
}
