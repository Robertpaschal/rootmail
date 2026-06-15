import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, MAX_SEQUENCE_STEPS, newId, SEQUENCE_TRIGGER_TYPES } from "@rootmail/core";
import {
  contacts,
  db,
  type Sequence,
  type SequenceEnrollment,
  sequenceEnrollments,
  sequences,
} from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { findContact } from "../lib/queries";
import { parse } from "../lib/validate";

const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wait"), hours: z.number().min(0).max(24 * 90) }),
  z.object({ type: z.literal("send"), template: z.string().min(1) }),
  z.object({
    type: z.literal("branch"),
    event: z.enum(["opened", "clicked"]),
    within_hours: z.number().min(1).max(24 * 30),
    goto: z.number().int().min(0),
  }),
]);

const triggerSchema = z.object({
  type: z.enum(SEQUENCE_TRIGGER_TYPES),
  tag: z.string().optional(),
});

const createBody = z.object({
  name: z.string().min(1).max(120),
  status: z.enum(["active", "paused"]).default("active"),
  trigger: triggerSchema.default({ type: "manual" }),
  steps: z.array(stepSchema).max(MAX_SEQUENCE_STEPS).default([]),
  exit_on: z.array(z.enum(["replied", "unsubscribed"])).default(["replied", "unsubscribed"]),
});

const updateBody = createBody.partial();

function scopeOf(req: FastifyRequest): string | null {
  return req.auth.subTenant?.id ?? null;
}

function serialize(s: Sequence) {
  return {
    object: "sequence",
    id: s.id,
    name: s.name,
    status: s.status,
    trigger: s.trigger,
    steps: s.steps,
    exit_on: s.exitOn,
    created_at: s.createdAt.toISOString(),
  };
}

function serializeEnrollment(e: SequenceEnrollment) {
  return {
    object: "enrollment",
    id: e.id,
    sequence_id: e.sequenceId,
    email: e.email,
    status: e.status,
    current_step: e.currentStep,
    next_run_at: e.nextRunAt.toISOString(),
    created_at: e.createdAt.toISOString(),
  };
}

async function getScoped(req: FastifyRequest, id: string): Promise<Sequence> {
  const subTenantId = scopeOf(req);
  const [s] = await db
    .select()
    .from(sequences)
    .where(
      and(
        eq(sequences.id, id),
        eq(sequences.workspaceId, req.auth.workspace.id),
        subTenantId ? eq(sequences.subTenantId, subTenantId) : isNull(sequences.subTenantId),
      ),
    )
    .limit(1);
  if (!s) throw Errors.notFound(`Sequence ${id} not found`);
  return s;
}

export async function sequenceRoutes(app: FastifyInstance): Promise<void> {
  // Sequences are a Pro+ capability — gate the whole plugin.
  app.addHook("preHandler", async (req) => {
    await requireFeature(req, "sequences");
  });

  app.get("/v1/sequences", async (req) => {
    const subTenantId = scopeOf(req);
    const rows = await db
      .select()
      .from(sequences)
      .where(
        and(
          eq(sequences.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(sequences.subTenantId, subTenantId) : isNull(sequences.subTenantId),
        ),
      )
      .orderBy(desc(sequences.createdAt));
    return { object: "list", data: rows.map(serialize) };
  });

  app.post("/v1/sequences", async (req, reply) => {
    const body = parse(createBody, req.body);
    const [row] = await db
      .insert(sequences)
      .values({
        id: newId("sequence"),
        workspaceId: req.auth.workspace.id,
        subTenantId: scopeOf(req),
        name: body.name,
        status: body.status,
        trigger: body.trigger,
        steps: body.steps,
        exitOn: body.exit_on,
        createdBy: req.auth.user?.id ?? req.auth.apiKey?.id ?? null,
      })
      .returning();
    return reply.status(201).send(serialize(row));
  });

  app.get("/v1/sequences/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serialize(await getScoped(req, id));
  });

  app.patch("/v1/sequences/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(updateBody, req.body);
    const existing = await getScoped(req, id);
    const [updated] = await db
      .update(sequences)
      .set({
        name: body.name ?? existing.name,
        status: body.status ?? existing.status,
        trigger: body.trigger ?? existing.trigger,
        steps: body.steps ?? existing.steps,
        exitOn: body.exit_on ?? existing.exitOn,
        updatedAt: new Date(),
      })
      .where(eq(sequences.id, existing.id))
      .returning();
    return serialize(updated);
  });

  app.delete("/v1/sequences/:id", async (req) => {
    const { id } = req.params as { id: string };
    const s = await getScoped(req, id);
    await db.delete(sequences).where(eq(sequences.id, s.id));
    return { object: "sequence", id: s.id, deleted: true };
  });

  // --- Enroll a contact ---------------------------------------------------
  app.post("/v1/sequences/:id/enroll", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parse(z.object({ email: z.string().email().optional(), contact_id: z.string().optional() }), req.body);
    const seq = await getScoped(req, id);
    const subTenantId = scopeOf(req);

    let email = body.email?.toLowerCase();
    let contactId: string | null = null;
    if (body.contact_id) {
      const [c] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, body.contact_id), eq(contacts.workspaceId, req.auth.workspace.id)))
        .limit(1);
      if (!c) throw Errors.notFound(`Contact ${body.contact_id} not found`);
      email = c.email;
      contactId = c.id;
    }
    if (!email) throw Errors.validation("Provide `email` or `contact_id`.");
    if (!contactId) contactId = (await findContact(req.auth.workspace.id, subTenantId, email))?.id ?? null;

    // Don't double-enroll an already-active contact.
    const existing = await db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.sequenceId, seq.id),
          eq(sequenceEnrollments.email, email),
          eq(sequenceEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (existing[0]) return reply.status(200).send(serializeEnrollment(existing[0]));

    const [row] = await db
      .insert(sequenceEnrollments)
      .values({
        id: newId("sequenceEnrollment"),
        sequenceId: seq.id,
        workspaceId: req.auth.workspace.id,
        subTenantId,
        contactId,
        email,
        status: "active",
        currentStep: 0,
        nextRunAt: new Date(),
      })
      .returning();
    return reply.status(201).send(serializeEnrollment(row));
  });

  app.get("/v1/sequences/:id/enrollments", async (req) => {
    const { id } = req.params as { id: string };
    const seq = await getScoped(req, id);
    const rows = await db
      .select()
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, seq.id))
      .orderBy(desc(sequenceEnrollments.createdAt))
      .limit(200);
    return { object: "list", data: rows.map(serializeEnrollment) };
  });

  // Cancel (exit) an active enrollment.
  app.post("/v1/sequences/:id/enrollments/:enrollmentId/cancel", async (req) => {
    const { id, enrollmentId } = req.params as { id: string; enrollmentId: string };
    const seq = await getScoped(req, id);
    const [updated] = await db
      .update(sequenceEnrollments)
      .set({ status: "exited", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sequenceEnrollments.id, enrollmentId), eq(sequenceEnrollments.sequenceId, seq.id)))
      .returning();
    if (!updated) throw Errors.notFound(`Enrollment ${enrollmentId} not found`);
    return serializeEnrollment(updated);
  });
}
