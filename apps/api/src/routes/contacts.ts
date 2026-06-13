import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONTACT_STATUSES, Errors, newId } from "@rootmail/core";
import { contacts, db } from "@rootmail/db";
import { addSuppression, findContact, isSuppressed } from "../lib/queries";
import { serializeContact } from "../lib/serialize";
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

    return reply.status(200).send({ ok: true, email: body.email, status: "unsubscribed" });
  });

  // --- Suppression check --------------------------------------------------
  app.get("/v1/suppressions/check", async (req) => {
    const q = parse(emailBody, req.query);
    const suppressed = await isSuppressed(req.auth.workspace.id, req.auth.subTenant?.id ?? null, q.email);
    return { email: q.email, suppressed };
  });
}
