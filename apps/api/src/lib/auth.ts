import { and, eq, isNull, lt, or } from "drizzle-orm";
import { generateSessionToken, newId, sha256Hex } from "@rootmail/core";
import {
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
} from "@rootmail/db";

// A branded starter template seeded into every new account so the workspace
// isn't empty on first login — it opens in the writing editor (blocks) and
// already demonstrates the footer + signed {{unsubscribe_url}}.
const STARTER_TEMPLATE = {
  name: "Welcome",
  slug: "welcome",
  type: "transactional" as const,
  subject: "Welcome to {{product}}, {{name}}!",
  html:
    `<!doctype html><html><body style="margin:0;background:#f4f4f7;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;"><tr><td align="center" style="padding:24px;">` +
    `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><tr><td style="padding:32px;">` +
    `<h1 style="margin:0 0 12px;font-size:24px;color:#111827;">Welcome, {{name}} 👋</h1>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Thanks for joining {{product}} — we're glad you're here.</p>` +
    `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:6px;background:#4f46e5;"><a href="{{action_url}}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">Get started</a></td></tr></table>` +
    `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">You're receiving this because you signed up for {{product}}. <a href="{{unsubscribe_url}}" style="color:#9ca3af;">Unsubscribe</a>.</p>` +
    `</td></tr></table></td></tr></table></body></html>`,
  text:
    "Welcome, {{name}}!\n\nThanks for joining {{product}} — we're glad you're here.\nGet started: {{action_url}}\n\nUnsubscribe: {{unsubscribe_url}}",
  blocks: {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome, {{name}} 👋" }] },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thanks for joining {{product}} — we're glad you're here." }],
      },
      { type: "button", attrs: { label: "Get started", href: "{{action_url}}", bg: "#4f46e5" } },
      {
        type: "footer",
        attrs: { text: "You're receiving this because you signed up for {{product}}.", showUnsubscribe: true },
      },
    ],
  } as Record<string, unknown>,
  variablesSchema: { name: "string", product: "string", action_url: "string (url)" } as Record<string, unknown>,
};

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
    .where(eq(memberships.userId, userId));
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
    .where(and(eq(workspaces.id, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  return row?.workspace ?? null;
}

/** The user's default workspace — their live one, else any. */
export async function defaultWorkspaceForUser(userId: string): Promise<Workspace | null> {
  const all = await userWorkspaces(userId);
  return all.find((w) => w.environment === "live") ?? all[0] ?? null;
}
