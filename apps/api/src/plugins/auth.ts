import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { Errors, hashApiKey } from "@rootmail/core";
import { apiKeys, db, subTenants, workspaces } from "@rootmail/db";
import type { AuthContext } from "../context";

// Paths that don't require an API key.
const PUBLIC_PREFIXES = ["/health", "/v1/webhooks"];

function isPublic(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return undefined;
  return token.trim();
}

export function registerAuth(app: FastifyInstance): void {
  // Reserve the property; the hook populates it per request.
  app.decorateRequest("auth", null as unknown as AuthContext);

  app.addHook("onRequest", async (req) => {
    if (isPublic(req.url)) return;

    const token = extractBearer(req.headers.authorization);
    if (!token) throw Errors.unauthorized();

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(token)))
      .limit(1);
    if (!key || key.revokedAt) throw Errors.unauthorized();

    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, key.workspaceId))
      .limit(1);
    if (!workspace) throw Errors.unauthorized();

    let subTenant: AuthContext["subTenant"] = null;
    const rawHeader = req.headers["x-rootmail-subtenant"];
    const subId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (subId) {
      const [st] = await db
        .select()
        .from(subTenants)
        .where(and(eq(subTenants.id, subId), eq(subTenants.workspaceId, workspace.id)))
        .limit(1);
      if (!st) throw Errors.notFound(`Sub-tenant ${subId} not found in this workspace`);
      subTenant = st;
    }

    req.auth = { apiKey: key, workspace, subTenant, mode: key.mode };

    // Best-effort last-used tracking; never block the request on it.
    void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  });
}
