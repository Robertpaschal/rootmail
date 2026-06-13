import { eq } from "drizzle-orm";
import { generateApiKey, generateSessionToken, newId, sha256Hex } from "@rootmail/core";
import {
  type ApiKey,
  apiKeys,
  db,
  memberships,
  organizations,
  type Session,
  sessions,
  type User,
  users,
  type Workspace,
  workspaces,
} from "@rootmail/db";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createSession(
  userId: string,
  activeWorkspaceId: string | null,
): Promise<{ token: string; session: Session }> {
  const { token, hash } = generateSessionToken();
  const [session] = await db
    .insert(sessions)
    .values({
      id: newId("session"),
      userId,
      tokenHash: hash,
      activeWorkspaceId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .returning();
  return { token, session };
}

/** Resolve a session token to its session + user, or null if invalid/expired. */
export async function resolveSession(
  token: string,
): Promise<{ session: Session; user: User } | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;

  void db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
  return { session, user };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)));
}

export interface ProvisionedAccount {
  user: User;
  organizationId: string;
  production: Workspace;
  sandbox: Workspace;
  apiKeyRow: ApiKey;
  apiKeySecret: string;
}

/**
 * Sign-up provisioning, mirroring the seed: a user, their organization, a live
 * Production + test Sandbox workspace, an owner membership, and a first live API
 * key. Atomic — a failure rolls the whole thing back.
 */
export async function provisionAccount(params: {
  email: string;
  passwordHash: string | null;
  name?: string | null;
  organizationName?: string | null;
}): Promise<ProvisionedAccount> {
  const orgName =
    params.organizationName?.trim() || params.name?.trim() || params.email.split("@")[0];
  const generated = generateApiKey("live");

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        id: newId("user"),
        email: params.email,
        name: params.name ?? null,
        passwordHash: params.passwordHash ?? null,
      })
      .returning();

    const orgId = newId("organization");
    await tx.insert(organizations).values({
      id: orgId,
      name: orgName,
      slug: `${slugify(orgName) || "workspace"}-${orgId.slice(-6)}`,
    });

    await tx.insert(memberships).values({
      id: newId("membership"),
      userId: user.id,
      organizationId: orgId,
      role: "owner",
    });

    const [production] = await tx
      .insert(workspaces)
      .values({
        id: newId("workspace"),
        organizationId: orgId,
        name: "Production",
        slug: "production",
        environment: "live",
      })
      .returning();

    const [sandbox] = await tx
      .insert(workspaces)
      .values({
        id: newId("workspace"),
        organizationId: orgId,
        name: "Sandbox",
        slug: "sandbox",
        environment: "test",
      })
      .returning();

    const [apiKeyRow] = await tx
      .insert(apiKeys)
      .values({
        id: newId("apiKey"),
        workspaceId: production.id,
        name: "Default key",
        prefix: generated.prefix,
        last4: generated.last4,
        keyHash: generated.hash,
        mode: "live",
      })
      .returning();

    return {
      user,
      organizationId: orgId,
      production,
      sandbox,
      apiKeyRow,
      apiKeySecret: generated.key,
    };
  });
}

/** Workspaces a user can access (via their org memberships). */
export async function userWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.organizationId, memberships.organizationId))
    .where(eq(memberships.userId, userId));
  return rows.map((r) => r.workspace);
}
