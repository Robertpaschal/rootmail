import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  assertPublicUrl,
  Errors,
  newId,
  randomToken,
  WEBHOOK_ENDPOINT_STATUSES,
  WEBHOOK_EVENTS,
} from "@rootmail/core";
import { db, type WebhookEndpoint, webhookEndpoints } from "@rootmail/db";
import { parse } from "../lib/validate";

const eventName = z
  .string()
  .refine((e) => e === "*" || (WEBHOOK_EVENTS as readonly string[]).includes(e), "Unknown event name");

const createBody = z.object({
  url: z.string().url(),
  events: z.array(eventName).min(1).default(["*"]),
  description: z.string().max(200).optional(),
});

const updateBody = z.object({
  url: z.string().url().optional(),
  events: z.array(eventName).min(1).optional(),
  description: z.string().max(200).nullable().optional(),
  status: z.enum(WEBHOOK_ENDPOINT_STATUSES).optional(),
});

function serialize(e: WebhookEndpoint, opts: { secret?: boolean } = {}) {
  return {
    object: "webhook_endpoint",
    id: e.id,
    url: e.url,
    events: e.events,
    description: e.description,
    status: e.status,
    disabled_at: e.disabledAt?.toISOString() ?? null,
    created_at: e.createdAt.toISOString(),
    // The signing secret is shown ONLY on create (and never again).
    ...(opts.secret ? { secret: e.secret } : {}),
  };
}

async function getScoped(req: FastifyRequest, id: string): Promise<WebhookEndpoint> {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.workspaceId, req.auth.workspace.id)))
    .limit(1);
  if (!row) throw Errors.notFound(`Webhook endpoint ${id} not found`);
  return row;
}

async function validateUrl(url: string): Promise<void> {
  try {
    await assertPublicUrl(url);
  } catch (err) {
    throw Errors.validation(err instanceof Error ? err.message : "Invalid webhook URL");
  }
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // --- Create (reveals the signing secret once) ---------------------------
  app.post("/v1/webhook-endpoints", async (req, reply) => {
    const body = parse(createBody, req.body);
    await validateUrl(body.url);

    const [row] = await db
      .insert(webhookEndpoints)
      .values({
        id: newId("webhookEndpoint"),
        workspaceId: req.auth.workspace.id,
        url: body.url,
        secret: `whsec_${randomToken(32)}`,
        events: body.events,
        description: body.description ?? null,
      })
      .returning();
    return reply.status(201).send(serialize(row, { secret: true }));
  });

  // --- List ---------------------------------------------------------------
  app.get("/v1/webhook-endpoints", async (req) => {
    const rows = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.workspaceId, req.auth.workspace.id))
      .orderBy(desc(webhookEndpoints.createdAt));
    return { object: "list", data: rows.map((r) => serialize(r)) };
  });

  // --- Retrieve -----------------------------------------------------------
  app.get("/v1/webhook-endpoints/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serialize(await getScoped(req, id));
  });

  // --- Update (re-validates the URL; can re-enable a disabled endpoint) ----
  app.patch("/v1/webhook-endpoints/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(updateBody, req.body);
    const existing = await getScoped(req, id);
    if (body.url && body.url !== existing.url) await validateUrl(body.url);

    const [updated] = await db
      .update(webhookEndpoints)
      .set({
        url: body.url ?? existing.url,
        events: body.events ?? existing.events,
        description: body.description !== undefined ? body.description : existing.description,
        status: body.status ?? existing.status,
        // Re-enabling clears the failure counter so it gets a fresh start.
        consecutiveFailures: body.status === "active" ? 0 : existing.consecutiveFailures,
        disabledAt: body.status === "active" ? null : existing.disabledAt,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, existing.id))
      .returning();
    return serialize(updated);
  });

  // --- Delete -------------------------------------------------------------
  app.delete("/v1/webhook-endpoints/:id", async (req) => {
    const { id } = req.params as { id: string };
    const e = await getScoped(req, id);
    await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, e.id));
    return { object: "webhook_endpoint", id: e.id, deleted: true };
  });
}
