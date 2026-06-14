import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, newId, TEMPLATE_TYPES } from "@rootmail/core";
import { db, type Template, templates } from "@rootmail/db";
import { serializeTemplate } from "../lib/serialize";
import { parse } from "../lib/validate";

const slugRe = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const createBody = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(80).regex(slugRe, "Use lowercase letters, numbers and hyphens."),
  type: z.enum(TEMPLATE_TYPES).default("transactional"),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  blocks: z.record(z.unknown()).nullish(),
  variables_schema: z.record(z.unknown()).optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(80).regex(slugRe, "Use lowercase letters, numbers and hyphens.").optional(),
  type: z.enum(TEMPLATE_TYPES).optional(),
  subject: z.string().min(1).optional(),
  html: z.string().min(1).optional(),
  text: z.string().nullable().optional(),
  blocks: z.record(z.unknown()).nullish(),
  variables_schema: z.record(z.unknown()).optional(),
});

/** Templates are workspace-scoped, with an optional sub-tenant override (via the
 * X-Rootmail-Subtenant header, resolved by the auth hook). */
function scopeOf(req: FastifyRequest): string | null {
  return req.auth.subTenant?.id ?? null;
}

async function getScoped(req: FastifyRequest, id: string): Promise<Template> {
  const subTenantId = scopeOf(req);
  const [tpl] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, id),
        eq(templates.workspaceId, req.auth.workspace.id),
        subTenantId ? eq(templates.subTenantId, subTenantId) : isNull(templates.subTenantId),
      ),
    )
    .limit(1);
  if (!tpl) throw Errors.notFound(`Template ${id} not found`);
  return tpl;
}

/** Slug uniqueness per (workspace, scope) — enforced in app code because the DB
 * unique index treats NULL sub_tenant_id rows as distinct (no nullsNotDistinct). */
async function slugTaken(
  workspaceId: string,
  subTenantId: string | null,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: templates.id, subTenantId: templates.subTenantId })
    .from(templates)
    .where(and(eq(templates.workspaceId, workspaceId), eq(templates.slug, slug)));
  return rows.some((r) => r.subTenantId === subTenantId && r.id !== exceptId);
}

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  // --- List ---------------------------------------------------------------
  app.get("/v1/templates", async (req) => {
    const subTenantId = scopeOf(req);
    const rows = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(templates.subTenantId, subTenantId) : isNull(templates.subTenantId),
        ),
      )
      .orderBy(desc(templates.createdAt));
    return { object: "list", data: rows.map(serializeTemplate) };
  });

  // --- Create -------------------------------------------------------------
  app.post("/v1/templates", async (req, reply) => {
    const body = parse(createBody, req.body);
    const subTenantId = scopeOf(req);
    const slug = body.slug.toLowerCase();

    if (await slugTaken(req.auth.workspace.id, subTenantId, slug)) {
      throw Errors.conflict(`A template with slug "${slug}" already exists`);
    }

    const [row] = await db
      .insert(templates)
      .values({
        id: newId("template"),
        workspaceId: req.auth.workspace.id,
        subTenantId,
        name: body.name,
        slug,
        type: body.type,
        subject: body.subject,
        html: body.html,
        text: body.text ?? null,
        blocks: body.blocks ?? null,
        variablesSchema: body.variables_schema ?? {},
      })
      .returning();

    return reply.status(201).send(serializeTemplate(row));
  });

  // --- Retrieve (by id or slug) -------------------------------------------
  app.get("/v1/templates/:id", async (req) => {
    const { id } = req.params as { id: string };
    const subTenantId = scopeOf(req);
    const rows = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.workspaceId, req.auth.workspace.id),
          subTenantId ? eq(templates.subTenantId, subTenantId) : isNull(templates.subTenantId),
        ),
      );
    const tpl = rows.find((r) => r.id === id) ?? rows.find((r) => r.slug === id);
    if (!tpl) throw Errors.notFound(`Template ${id} not found`);
    return serializeTemplate(tpl);
  });

  // --- Update -------------------------------------------------------------
  // Editing subject/html/text bumps current_version; other edits don't.
  app.patch("/v1/templates/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(updateBody, req.body);
    const existing = await getScoped(req, id);

    const nextSlug = body.slug ? body.slug.toLowerCase() : existing.slug;
    if (nextSlug !== existing.slug) {
      if (await slugTaken(req.auth.workspace.id, existing.subTenantId, nextSlug, existing.id)) {
        throw Errors.conflict(`A template with slug "${nextSlug}" already exists`);
      }
    }

    const nextText = body.text !== undefined ? body.text : existing.text;
    const contentChanged =
      (body.subject !== undefined && body.subject !== existing.subject) ||
      (body.html !== undefined && body.html !== existing.html) ||
      nextText !== existing.text;

    const [updated] = await db
      .update(templates)
      .set({
        name: body.name ?? existing.name,
        slug: nextSlug,
        type: body.type ?? existing.type,
        subject: body.subject ?? existing.subject,
        html: body.html ?? existing.html,
        text: nextText,
        blocks: body.blocks !== undefined ? body.blocks : existing.blocks,
        variablesSchema: body.variables_schema ?? existing.variablesSchema,
        currentVersion: contentChanged ? existing.currentVersion + 1 : existing.currentVersion,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, existing.id))
      .returning();

    return serializeTemplate(updated);
  });

  // --- Delete -------------------------------------------------------------
  app.delete("/v1/templates/:id", async (req) => {
    const { id } = req.params as { id: string };
    const tpl = await getScoped(req, id);
    await db.delete(templates).where(eq(templates.id, tpl.id));
    return { object: "template", id: tpl.id, deleted: true };
  });
}
