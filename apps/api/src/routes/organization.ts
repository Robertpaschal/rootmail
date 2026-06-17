import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, type Organization, organizations } from "@rootmail/db";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  // The CAN-SPAM postal address shown in marketing/sales footers. null clears it.
  postal_address: z.string().max(500).nullable().optional(),
});

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
}
