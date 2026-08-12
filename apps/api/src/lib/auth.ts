import { and, eq, isNull, lt, or } from "drizzle-orm";
import { defaultTierId, generateSessionToken, newId, sha256Hex } from "@rootmail/core";
import {
  STARTER_TEMPLATE,
  db,
  memberships,
  organizations,
  type Session,
  sessions,
  templates,
  type User,
  users,
  type Workspace,
  workspaces,
  customerChanged,
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
  opts: { impersonatedByStaffId?: string; ttlMs?: number } = {},
): Promise<{ token: string; session: Session }> {
  const { token, hash } = generateSessionToken();
  const [session] = await db
    .insert(sessions)
    .values({
      id: newId("session"),
      userId,
      tokenHash: hash,
      activeWorkspaceId,
      impersonatedByStaffId: opts.impersonatedByStaffId ?? null,
      expiresAt: new Date(Date.now() + (opts.ttlMs ?? SESSION_TTL_MS)),
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
  // Stamp the user's last activity, throttled to ~1/hour (via the WHERE) to bound
  // writes — feeds the inactivity win-back sweep.
  void db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(
      and(
        eq(users.id, user.id),
        or(isNull(users.lastActiveAt), lt(users.lastActiveAt, new Date(Date.now() - 3_600_000))),
      ),
    );
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
}

/**
 * Sign-up provisioning: a user, their organization, a live Production + test
 * Sandbox workspace, an owner membership, and a starter template. No API key is
 * minted — everyday users work entirely through the dashboard (which authenticates
 * with the user's session); developers create a key on demand from the Developers
 * section. Atomic — a failure rolls the whole thing back.
 */
export async function provisionAccount(params: {
  /** Set when the account came through a closed-beta code — see lib/beta.ts. */
  betaInviteId?: string | null;
  email: string;
  passwordHash: string | null;
  name?: string | null;
  organizationName?: string | null;
}): Promise<ProvisionedAccount> {
  const orgName =
    params.organizationName?.trim() || params.name?.trim() || params.email.split("@")[0];

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
      // A beta tester is not on a plan. We asked them to try everything and
      // tell us what breaks, so a paywall would only earn feedback about the
      // paywall. The invite id stays alongside the flag so every tester traces
      // back to the code — and the person — we gave it to.
      isBeta: Boolean(params.betaInviteId),
      betaInviteId: params.betaInviteId ?? null,
      // Per-wing pricing from day one: Free on each wing (transactional starts on
      // the free allowance; blocks are purchased when they scale).
      transactionalTier: defaultTierId("transactional"),
      marketingTier: defaultTierId("marketing"),
      platformTier: defaultTierId("platform"),
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

    // Seed a starter template so the new account isn't empty on first login.
    await tx.insert(templates).values({
      id: newId("template"),
      workspaceId: production.id,
      subTenantId: null,
      ...STARTER_TEMPLATE,
    });

    // Mirror the new account into our own audience so we can reach them with
    // our own product. Fire-and-forget: signup must never fail on our CRM.
    customerChanged(orgId);

    return {
      user,
      organizationId: orgId,
      production,
      sandbox,
    };
  });
}

/** Find-or-create a user from a verified social-login identity (no password). */
export async function upsertOAuthUser(params: {
  email: string;
  name?: string | null;
  emailVerified?: boolean;
}): Promise<{ user: User; created: boolean }> {
  const email = params.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    if (params.emailVerified && !existing.emailVerifiedAt) {
      const now = new Date();
      await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, existing.id));
      existing.emailVerifiedAt = now;
    }
    return { user: existing, created: false };
  }
  const account = await provisionAccount({ email, passwordHash: null, name: params.name });
  const user = account.user;
  if (params.emailVerified) {
    const now = new Date();
    await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id));
    user.emailVerifiedAt = now;
  }
  return { user, created: true };
}

/** Workspaces a user can access (via their org memberships). */
export async function userWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.organizationId, memberships.organizationId))
    // An inactive membership (SCIM-deprovisioned) grants no workspace access.
    .where(and(eq(memberships.userId, userId), eq(memberships.active, true)));
  return rows.map((r) => r.workspace);
}

/** A specific workspace, only if the user can access it (else null). */
export async function workspaceForUser(
  userId: string,
  workspaceId: string,
): Promise<Workspace | null> {
  const [row] = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.organizationId, workspaces.organizationId))
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(memberships.userId, userId),
        eq(memberships.active, true),
      ),
    )
    .limit(1);
  return row?.workspace ?? null;
}

/** The user's default workspace — their live one, else any. */
export async function defaultWorkspaceForUser(userId: string): Promise<Workspace | null> {
  const all = await userWorkspaces(userId);
  return all.find((w) => w.environment === "live") ?? all[0] ?? null;
}
