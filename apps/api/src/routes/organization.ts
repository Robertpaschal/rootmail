import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "@rootmail/core";
import {
  contacts,
  db,
  memberships,
  type Organization,
  organizations,
  subTenants,
  templates,
  users,
  workspaces,
} from "@rootmail/db";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  // The CAN-SPAM postal address shown in marketing/sales footers. null clears it.
  postal_address: z.string().max(500).nullable().optional(),
});

const deleteBody = z.object({ confirm: z.string() });

function serialize(org: Organization) {
  return {
    object: "organization",
    id: org.id,
    name: org.name,
    plan: org.plan,
    postal_address: org.postalAddress ?? null,
  };
}

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/organization", async (req) => serialize(await loadOrg(req)));

  app.patch("/v1/organization", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const body = parse(updateBody, req.body);
    const [updated] = await db
      .update(organizations)
      .set({
        name: body.name ?? org.name,
        postalAddress: body.postal_address !== undefined ? body.postal_address : org.postalAddress,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id))
      .returning();
    return serialize(updated);
  });

  // --- GDPR: data export (portability) ------------------------------------
  app.get("/v1/account/export", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const ws = await db
      .select({ id: workspaces.id, name: workspaces.name, environment: workspaces.environment })
      .from(workspaces)
      .where(eq(workspaces.organizationId, org.id));
    const wsIds = ws.map((w) => w.id);

    const members = await db
      .select({ email: users.email, role: memberships.role, created_at: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, org.id));

    const tenants = wsIds.length
      ? await db
          .select({ id: subTenants.id, sending_domain: subTenants.sendingDomain, status: subTenants.status })
          .from(subTenants)
          .where(inArray(subTenants.workspaceId, wsIds))
      : [];

    // Recipient data is the most GDPR-relevant; capped here (a production export
    // would stream/paginate the full set).
    const contactRows = wsIds.length
      ? await db
          .select({ email: contacts.email, name: contacts.name, status: contacts.status })
          .from(contacts)
          .where(inArray(contacts.workspaceId, wsIds))
          .limit(5000)
      : [];

    const templateRows = wsIds.length
      ? await db
          .select({ name: templates.name, slug: templates.slug, type: templates.type })
          .from(templates)
          .where(inArray(templates.workspaceId, wsIds))
      : [];

    return {
      object: "account_export",
      exported_at: new Date().toISOString(),
      organization: serialize(org),
      workspaces: ws,
      members,
      sub_tenants: tenants,
      contacts: contactRows,
      templates: templateRows,
    };
  });

  // --- GDPR: account deletion (right to erasure) --------------------------
  // Destructive + irreversible: owner-only, confirmed by typing the org name.
  // Deleting the org cascades all workspace data; orphaned member users (and
  // their sessions) are then removed.
  app.delete("/v1/account", async (req) => {
    const org = await loadOrg(req);

    if (req.auth.user) {
      const [m] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, req.auth.user.id), eq(memberships.organizationId, org.id)))
        .limit(1);
      if (m?.role !== "owner") {
        throw Errors.forbidden("Only the organization owner can delete the account.");
      }
    }

    const body = parse(deleteBody, req.body ?? {});
    if (body.confirm !== org.name) {
      throw Errors.badRequest(`Type the organization name "${org.name}" to confirm deletion.`);
    }

    const memberIds = (
      await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.organizationId, org.id))
    ).map((m) => m.userId);

    await db.delete(organizations).where(eq(organizations.id, org.id)); // cascades workspaces + all data

    for (const userId of memberIds) {
      const remaining = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .limit(1);
      if (remaining.length === 0) await db.delete(users).where(eq(users.id, userId));
    }

    return { object: "account", id: org.id, deleted: true };
  });
}
