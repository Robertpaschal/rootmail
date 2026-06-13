import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors, hashPassword, verifyPassword } from "@rootmail/core";
import { db, users } from "@rootmail/db";
import {
  createSession,
  defaultWorkspaceForUser,
  deleteSession,
  provisionAccount,
  resolveSession,
  userWorkspaces,
  workspaceForUser,
} from "../lib/auth";
import { serializeApiKey, serializeUser, serializeWorkspace } from "../lib/serialize";
import { parse } from "../lib/validate";

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().min(1).max(120).optional(),
  organization_name: z.string().min(1).max(120).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return undefined;
  return token.trim();
}

async function requireSession(req: FastifyRequest) {
  const token = bearerToken(req);
  if (!token) throw Errors.unauthorized();
  const resolved = await resolveSession(token);
  if (!resolved) throw Errors.unauthorized();
  return resolved;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // --- Sign up ------------------------------------------------------------
  app.post("/v1/auth/signup", async (req, reply) => {
    const body = parse(signupBody, req.body);
    const email = body.email.toLowerCase();

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw Errors.conflict("An account with that email already exists.");

    const account = await provisionAccount({
      email,
      passwordHash: hashPassword(body.password),
      name: body.name,
      organizationName: body.organization_name,
    });

    const { token, session } = await createSession(account.user.id, account.production.id);

    return reply.status(201).send({
      user: serializeUser(account.user),
      workspace: serializeWorkspace(account.production),
      active_workspace: serializeWorkspace(account.production),
      workspaces: [account.production, account.sandbox].map(serializeWorkspace),
      // The first key's secret, shown once — same contract as POST /v1/api-keys.
      api_key: { ...serializeApiKey(account.apiKeyRow), key: account.apiKeySecret },
      session_token: token,
      session_expires_at: session.expiresAt,
    });
  });

  // --- Log in -------------------------------------------------------------
  app.post("/v1/auth/login", async (req) => {
    const body = parse(loginBody, req.body);
    const email = body.email.toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Verify even when the user is missing to keep timing uniform.
    const ok = verifyPassword(body.password, user?.passwordHash);
    if (!user || !ok) throw Errors.unauthorized("Invalid email or password.");

    const workspaces = await userWorkspaces(user.id);
    const live = workspaces.find((w) => w.environment === "live") ?? workspaces[0] ?? null;
    const { token, session } = await createSession(user.id, live?.id ?? null);

    return {
      user: serializeUser(user),
      workspaces: workspaces.map(serializeWorkspace),
      active_workspace: live ? serializeWorkspace(live) : null,
      session_token: token,
      session_expires_at: session.expiresAt,
    };
  });

  // --- Current user -------------------------------------------------------
  app.get("/v1/auth/me", async (req) => {
    const { user, session } = await requireSession(req);
    const workspaces = await userWorkspaces(user.id);
    const active =
      (session.activeWorkspaceId
        ? await workspaceForUser(user.id, session.activeWorkspaceId)
        : null) ?? (await defaultWorkspaceForUser(user.id));
    return {
      user: serializeUser(user),
      workspaces: workspaces.map(serializeWorkspace),
      active_workspace: active ? serializeWorkspace(active) : null,
    };
  });

  // --- Log out ------------------------------------------------------------
  app.post("/v1/auth/logout", async (req) => {
    const token = bearerToken(req);
    if (token) await deleteSession(token);
    return { ok: true };
  });
}
