import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, newId, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "@rootmail/core";
import { db, type Role, roles } from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { actorPermissions, requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

const slugRe = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const permList = z.array(z.enum(PERMISSIONS)).min(1);
const createBody = z.object({
  name: z.string().min(1).max(60),
  key: z.string().max(40).regex(slugRe).optional(),
  permissions: permList,
});
const updateBody = z.object({
  name: z.string().min(1).max(60).optional(),
  permissions: permList.optional(),
});

function serialize(r: Role) {
  return {
    object: "role",
    id: r.id,
    key: r.key,
    name: r.name,
    permissions: r.permissions,
    created_at: r.createdAt.toISOString(),
  };
}

/** You can't grant a permission you don't hold yourself (privilege escalation). */
async function assertCanGrant(req: FastifyRequest, perms: string[]): Promise<void> {
  const actor = await actorPermissions(req);
  if (actor === "all") return;
  const missing = perms.filter((p) => !actor.has(p));
  if (missing.length) {
    throw Errors.forbidden(`You can't grant permissions you don't hold: ${missing.join(", ")}`);
  }
}

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  // Custom roles are a Scale feature, managed by members.manage holders.
  app.addHook("preHandler", async (req) => {
    await requireFeature(req, "rbac");
    await requirePermission(req, "members.manage");
  });

  app.get("/v1/roles", async (req) => {
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, req.auth.workspace.organizationId))
      .orderBy(desc(roles.createdAt));
    // Ship the catalog + built-ins so the UI can build a role editor.
    return {
      object: "list",
      permissions: PERMISSIONS,
      system_roles: SYSTEM_ROLE_PERMISSIONS,
      data: rows.map(serialize),
    };
  });

  app.post("/v1/roles", async (req, reply) => {
    const body = parse(createBody, req.body);
    await assertCanGrant(req, body.permissions);
    const orgId = req.auth.workspace.organizationId;
    const key =
      (body.key ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).slice(0, 40) ||
      "role";

    const [dupe] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, orgId), eq(roles.key, key)))
      .limit(1);
    if (dupe) throw Errors.conflict(`A role with key "${key}" already exists`);

    // "read" is implied for any role so holders can at least view.
    const permissions = Array.from(new Set([...body.permissions, "read"]));
    const [row] = await db
      .insert(roles)
      .values({ id: newId("role"), organizationId: orgId, key, name: body.name, permissions })
      .returning();
    return reply.status(201).send(serialize(row));
  });

  app.patch("/v1/roles/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(updateBody, req.body);
    if (body.permissions) await assertCanGrant(req, body.permissions);
    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.organizationId, req.auth.workspace.organizationId)))
      .limit(1);
    if (!existing) throw Errors.notFound(`Role ${id} not found`);
    const permissions = body.permissions
      ? Array.from(new Set([...body.permissions, "read"]))
      : existing.permissions;
    const [updated] = await db
      .update(roles)
      .set({ name: body.name ?? existing.name, permissions, updatedAt: new Date() })
      .where(eq(roles.id, existing.id))
      .returning();
    return serialize(updated);
  });

  app.delete("/v1/roles/:id", async (req) => {
    const { id } = req.params as { id: string };
    const [existing] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.organizationId, req.auth.workspace.organizationId)))
      .limit(1);
    if (!existing) throw Errors.notFound(`Role ${id} not found`);
    await db.delete(roles).where(eq(roles.id, existing.id));
    return { object: "role", id: existing.id, deleted: true };
  });
}
