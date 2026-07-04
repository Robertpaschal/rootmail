import { and, eq } from "drizzle-orm";
import { env, type MembershipRole, newId, sha256Hex } from "@rootmail/core";
import { db, memberships, sessions, ssoConnections, type User, users } from "@rootmail/db";

// SCIM 2.0 provisioning — the IdP (Okta/Entra) pushes user create/update/deactivate
// to rootmail so membership tracks the directory automatically, beyond JIT-on-login.
// Scoped per org by a bearer token whose SHA-256 is stored on the sso_connection.

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export function scimBaseUrl(): string {
  return `${env.PUBLIC_API_URL}/scim/v2`;
}

export interface ScimContext {
  organizationId: string;
  defaultRole: MembershipRole;
}

/** Resolve the SCIM bearer token to its org, or null if unknown/disabled. */
export async function resolveScim(token: string | undefined): Promise<ScimContext | null> {
  if (!token) return null;
  const [conn] = await db
    .select({ orgId: ssoConnections.organizationId, defaultRole: ssoConnections.defaultRole })
    .from(ssoConnections)
    .where(eq(ssoConnections.scimTokenHash, sha256Hex(token)))
    .limit(1);
  return conn ? { organizationId: conn.orgId, defaultRole: conn.defaultRole as MembershipRole } : null;
}

/** A membership joined to its user — the unit a SCIM "User" maps to. */
export interface ScimMember {
  membershipId: string;
  externalId: string | null;
  active: boolean;
  user: User;
}

export async function findScimMember(orgId: string, membershipId: string): Promise<ScimMember | null> {
  const [row] = await db
    .select({
      membershipId: memberships.id,
      externalId: memberships.scimExternalId,
      active: memberships.active,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function findScimMemberByEmail(orgId: string, email: string): Promise<ScimMember | null> {
  const [row] = await db
    .select({
      membershipId: memberships.id,
      externalId: memberships.scimExternalId,
      active: memberships.active,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, orgId), eq(users.email, email.toLowerCase())))
    .limit(1);
  return row ?? null;
}

export async function listScimMembers(orgId: string): Promise<ScimMember[]> {
  return db
    .select({
      membershipId: memberships.id,
      externalId: memberships.scimExternalId,
      active: memberships.active,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, orgId));
}

/** Create the user (if new) + membership for a SCIM-provisioned identity. */
export async function provisionScimMember(
  ctx: ScimContext,
  input: { email: string; name: string | null; externalId: string | null; active: boolean },
): Promise<ScimMember> {
  const email = input.email.toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        id: newId("user"),
        email,
        name: input.name,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      })
      .returning();
  }
  const [membership] = await db
    .insert(memberships)
    .values({
      id: newId("membership"),
      userId: user.id,
      organizationId: ctx.organizationId,
      role: ctx.defaultRole,
      active: input.active,
      scimExternalId: input.externalId,
    })
    .returning();
  return { membershipId: membership.id, externalId: membership.scimExternalId, active: membership.active, user };
}

/** Flip a membership active/inactive. Deactivation also kills the user's sessions so
 * access is revoked immediately, not just on the next request. */
export async function setMemberActive(member: ScimMember, active: boolean): Promise<void> {
  await db.update(memberships).set({ active }).where(eq(memberships.id, member.membershipId));
  if (!active) {
    await db.delete(sessions).where(eq(sessions.userId, member.user.id));
  }
}

export async function updateScimMember(
  member: ScimMember,
  patch: { name?: string | null; externalId?: string | null },
): Promise<void> {
  if (patch.name !== undefined) {
    await db.update(users).set({ name: patch.name }).where(eq(users.id, member.user.id));
  }
  if (patch.externalId !== undefined) {
    await db
      .update(memberships)
      .set({ scimExternalId: patch.externalId })
      .where(eq(memberships.id, member.membershipId));
  }
}

/** Serialize a member to the SCIM User schema. */
export function scimUser(member: ScimMember): Record<string, unknown> {
  const name = member.user.name ?? "";
  const [given, ...rest] = name.split(" ");
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: member.membershipId,
    externalId: member.externalId ?? undefined,
    userName: member.user.email,
    name: name ? { formatted: name, givenName: given, familyName: rest.join(" ") || undefined } : undefined,
    displayName: name || undefined,
    emails: [{ value: member.user.email, primary: true }],
    active: member.active,
    meta: { resourceType: "User", location: `${scimBaseUrl()}/Users/${member.membershipId}` },
  };
}
