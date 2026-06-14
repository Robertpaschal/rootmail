import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors, hashApiKey } from "@rootmail/core";
import { apiKeys, db, subTenants, type Workspace, workspaces } from "@rootmail/db";
import type { AuthContext } from "../context";
import { defaultWorkspaceForUser, resolveSession, workspaceForUser } from "../lib/auth";

// Paths that don't require an API key (auth endpoints carry their own session).
const PUBLIC_PREFIXES = ["/health", "/v1/webhooks", "/v1/auth", "/v1/unsubscribe", "/assets"];

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

/** Resolve an optional sub-tenant scope from the X-Rootmail-Subtenant header. */
async function resolveSubTenant(req: FastifyRequest, workspaceId: string) {
  const rawHeader = req.headers["x-rootmail-subtenant"];
  const subId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!subId) return null;

  const [st] = await db
    .select()
    .from(subTenants)
    .where(and(eq(subTenants.id, subId), eq(subTenants.workspaceId, workspaceId)))
    .limit(1);
  if (!st) throw Errors.notFound(`Sub-tenant ${subId} not found in this workspace`);
  return st;
}

async function authenticateApiKey(req: FastifyRequest, token: string): Promise<void> {
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

  const subTenant = await resolveSubTenant(req, workspace.id);
  req.auth = { apiKey: key, user: null, workspace, subTenant, mode: key.mode };

  // Best-effort last-used tracking; never block the request on it.
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
}

async function authenticateSession(req: FastifyRequest, token: string): Promise<void> {
  const resolved = await resolveSession(token);
  if (!resolved) throw Errors.unauthorized("Invalid or expired session");
  const { user, session } = resolved;

  // Workspace: explicit header → session's active → the account's default.
  const rawWs = req.headers["x-rootmail-workspace"];
  const headerWs = Array.isArray(rawWs) ? rawWs[0] : rawWs;

  let workspace: Workspace | null = null;
  if (headerWs) workspace = await workspaceForUser(user.id, headerWs);
  if (!workspace && session.activeWorkspaceId) {
    workspace = await workspaceForUser(user.id, session.activeWorkspaceId);
  }
  if (!workspace) workspace = await defaultWorkspaceForUser(user.id);
  if (!workspace) throw Errors.unauthorized("No workspace available for this account");

  const subTenant = await resolveSubTenant(req, workspace.id);
  req.auth = { apiKey: null, user, workspace, subTenant, mode: workspace.environment };
}

export function registerAuth(app: FastifyInstance): void {
  // Reserve the property; the hook populates it per request.
  app.decorateRequest("auth", null as unknown as AuthContext);

  app.addHook("onRequest", async (req) => {
    if (isPublic(req.url)) return;

    const token = extractBearer(req.headers.authorization);
    if (!token) throw Errors.unauthorized();

    // Session tokens (rms_…) come from the dashboard; everything else is an API key.
    if (token.startsWith("rms_")) {
      await authenticateSession(req, token);
    } else {
      await authenticateApiKey(req, token);
    }
  });
}
