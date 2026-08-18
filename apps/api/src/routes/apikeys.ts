import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, generateApiKey, newId } from "@rootmail/core";
import { apiKeys, db, subTenants } from "@rootmail/db";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { serializeApiKey } from "../lib/serialize";
import { parse } from "../lib/validate";

const createBody = z.object({
  name: z.string().min(1).max(120),
  /**
   * Pin the key to one client. Omit for a workspace key that can act as any
   * client via the header — which is what the platform itself should hold.
   */
  sub_tenant_id: z.string().optional(),
});

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // --- List ---------------------------------------------------------------
  // Includes revoked keys so the UI can show history; never the secret.
  app.get("/v1/api-keys", async (req) => {
    // A client-scoped key sees only its own client's keys. Without this, handing a
    // client a scoped key would also hand them an inventory of the platform's
    // credentials — and the revoke route below would let them cancel them.
    const conditions = [eq(apiKeys.workspaceId, req.auth.workspace.id)];
    if (req.auth.apiKey?.subTenantId) {
      conditions.push(eq(apiKeys.subTenantId, req.auth.apiKey.subTenantId));
    }
    const rows = await db
      .select()
      .from(apiKeys)
      .where(and(...conditions))
      .orderBy(desc(apiKeys.createdAt));
    return { object: "list", data: rows.map(serializeApiKey) };
  });

  // --- Create -------------------------------------------------------------
  // The full secret is returned exactly once; only its hash is stored. A key's
  // mode follows the workspace's environment — you can't mint a test key from a
  // live workspace.
  app.post("/v1/api-keys", async (req, reply) => {
    await requirePermission(req, "apikeys.manage");
    const body = parse(createBody, req.body);
    const mode = req.auth.workspace.environment;

    // A client-scoped key: verify the client is real and belongs to THIS
    // workspace before pinning to it, so a key can never be minted pointing at
    // another workspace's tenant.
    let subTenantId: string | null = null;
    if (body.sub_tenant_id) {
      await requireFeature(req, "subtenants");
      const [st] = await db
        .select({ id: subTenants.id })
        .from(subTenants)
        .where(
          and(
            eq(subTenants.id, body.sub_tenant_id),
            eq(subTenants.workspaceId, req.auth.workspace.id),
          ),
        )
        .limit(1);
      if (!st) throw Errors.notFound(`Sub-tenant ${body.sub_tenant_id} not found`);
      subTenantId = st.id;
    }

    // A key already pinned to a client must not be able to mint a wider one —
    // that would make the pin a formality anyone holding the key could undo.
    if (req.auth.apiKey?.subTenantId && subTenantId !== req.auth.apiKey.subTenantId) {
      throw Errors.forbidden(
        "A client-scoped API key can only create keys for that same client.",
      );
    }

    const generated = generateApiKey(mode);

    const [row] = await db
      .insert(apiKeys)
      .values({
        id: newId("apiKey"),
        workspaceId: req.auth.workspace.id,
        subTenantId,
        name: body.name,
        prefix: generated.prefix,
        last4: generated.last4,
        keyHash: generated.hash,
        mode,
      })
      .returning();

    return reply.status(201).send({ ...serializeApiKey(row), key: generated.key });
  });

  // --- Revoke -------------------------------------------------------------
  // Soft-delete: sets revoked_at so the auth hook rejects it. Revoking the key
  // you're currently authenticated with is refused to avoid locking yourself out.
  app.delete("/v1/api-keys/:id", async (req) => {
    await requirePermission(req, "apikeys.manage");
    const { id } = req.params as { id: string };

    if (req.auth.apiKey && id === req.auth.apiKey.id) {
      throw Errors.validation("You can't revoke the API key you're currently using.");
    }

    const conditions = [eq(apiKeys.id, id), eq(apiKeys.workspaceId, req.auth.workspace.id)];
    // Same reasoning as the list: a client-scoped key must not be able to revoke
    // the platform's own credentials, which would be a denial of service against
    // the customer by one of their customers.
    if (req.auth.apiKey?.subTenantId) {
      conditions.push(eq(apiKeys.subTenantId, req.auth.apiKey.subTenantId));
    }

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(...conditions))
      .limit(1);
    if (!key) throw Errors.notFound(`API key ${id} not found`);
    if (key.revokedAt) return serializeApiKey(key);

    const [updated] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .returning();

    return serializeApiKey(updated);
  });
}
