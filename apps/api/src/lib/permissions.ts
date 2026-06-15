import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { Errors, type Permission, SYSTEM_ROLE_PERMISSIONS } from "@rootmail/core";
import { db, memberships, roles } from "@rootmail/db";

/**
 * Resolve the actor's permissions. API keys are account-level secrets → full
 * access. Session users get their custom-role permissions if assigned, else
 * their system role's. Enforced on every tier; custom roles are Scale-only.
 */
export async function actorPermissions(req: FastifyRequest): Promise<Set<string> | "all"> {
  if (req.auth.apiKey) return "all";
  if (!req.auth.user) return new Set();

  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, req.auth.user.id),
        eq(memberships.organizationId, req.auth.workspace.organizationId),
      ),
    )
    .limit(1);
  if (!m) return new Set();

  if (m.customRoleId) {
    const [r] = await db.select().from(roles).where(eq(roles.id, m.customRoleId)).limit(1);
    if (r) return new Set(r.permissions);
  }
  return new Set(SYSTEM_ROLE_PERMISSIONS[m.role]);
}

/** Gate an action on a permission; 403 if the actor's role doesn't grant it. */
export async function requirePermission(req: FastifyRequest, perm: Permission): Promise<void> {
  const perms = await actorPermissions(req);
  if (perms === "all" || perms.has(perm)) return;
  throw Errors.forbidden(`Your role doesn't allow "${perm}".`);
}
