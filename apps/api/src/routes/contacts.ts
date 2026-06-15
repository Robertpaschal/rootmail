import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONTACT_STATUSES, Errors, newId, verifyUnsubscribeToken } from "@rootmail/core";
import { contacts, db } from "@rootmail/db";
import { addSuppression, findContact, isSuppressed } from "../lib/queries";
import { evaluateTriggers, exitEnrollments } from "../lib/sequence-triggers";
import { serializeContact } from "../lib/serialize";
import { parse } from "../lib/validate";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unsubPage(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f7;margin:0;padding:48px 16px;color:#374151}.card{max-width:440px;margin:0 auto;background:#fff;border-radius:10px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}h1{font-size:18px;color:#111827;margin:0 0 12px}.btn{display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1>${bodyHtml}</div></body></html>`;
}

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
}
