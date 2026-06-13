import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors, generateApiKey, newId } from "@rootmail/core";
import { apiKeys, db } from "@rootmail/db";
import { serializeApiKey } from "../lib/serialize";
import { parse } from "../lib/validate";

const createBody = z.object({
  name: z.string().min(1).max(120),
});

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // --- List ---------------------------------------------------------------
  // Includes revoked keys so the UI can show history; never the secret.
  app.get("/v1/api-keys", async (req) => {
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, req.auth.workspace.id))
      .orderBy(desc(apiKeys.createdAt));
    return { object: "list", data: rows.map(serializeApiKey) };
  });

  // --- Create -------------------------------------------------------------
  // The full secret is returned exactly once; only its hash is stored. A key's
  // mode follows the workspace's environment — you can't mint a test key from a
  // live workspace.
  app.post("/v1/api-keys", async (req, reply) => {
    const body = parse(createBody, req.body);
    const mode = req.auth.workspace.environment;
    const generated = generateApiKey(mode);

    const [row] = await db
      .insert(apiKeys)
      .values({
        id: newId("apiKey"),
        workspaceId: req.auth.workspace.id,
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
    const { id } = req.params as { id: string };

    if (req.auth.apiKey && id === req.auth.apiKey.id) {
      throw Errors.validation("You can't revoke the API key you're currently using.");
    }

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, req.auth.workspace.id)))
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
