import { SAML, type Profile } from "@node-saml/node-saml";
import { and, eq } from "drizzle-orm";
import { env, type MembershipRole, newId } from "@rootmail/core";
import {
  db,
  memberships,
  type SsoConnection,
  type User,
  users,
  workspaces,
} from "@rootmail/db";

// SAML SSO — every IdP interaction goes through @node-saml/node-saml, the vetted
// core of passport-saml. We never hand-verify XML signatures; the library checks
// the assertion signature against the IdP's configured x509 cert. The ACS lives on
// the dashboard (so it can set the rm_session cookie, mirroring OAuth); this module
// runs on the API, which holds the connection config + does the crypto.

/** SP entity id / issuer — a stable per-connection URI the org configures in the IdP. */
export function spEntityId(connectionId: string): string {
  return `${env.PUBLIC_API_URL}/saml/${connectionId}`;
}

/** Assertion Consumer Service — where the IdP POSTs the response (on the dashboard). */
export function acsUrl(connectionId: string): string {
  return `${env.DASHBOARD_URL}/sso/${connectionId}/acs`;
}

/** Build a node-saml instance for a connection. `wantAssertionsSigned` is the
 * security-critical flag — the assertion carrying the identity must be signed. */
export function samlFor(conn: SsoConnection): SAML {
  return new SAML({
    idpCert: conn.idpCertificate.trim(),
    issuer: spEntityId(conn.id),
    callbackUrl: acsUrl(conn.id),
    entryPoint: conn.idpSsoUrl,
    audience: spEntityId(conn.id),
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    acceptedClockSkewMs: 5000,
    identifierFormat: null,
    disableRequestedAuthnContext: true,
  });
}

/** SP metadata XML the IdP admin imports (declares our ACS + entity id). */
export function metadataXml(conn: SsoConnection): string {
  return samlFor(conn).generateServiceProviderMetadata(null, null);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pull a login email + display name out of a validated SAML profile, tolerant of
 * how different IdPs name their claims. */
export function extractIdentity(profile: Profile): { email: string; name: string | null } {
  const attrs = (profile.attributes ?? {}) as Record<string, unknown>;
  const attr = (...keys: string[]): string | null => {
    for (const k of Object.keys(attrs)) {
      if (keys.some((want) => k.toLowerCase() === want || k.toLowerCase().endsWith(`/${want}`))) {
        const v = attrs[k];
        const s = Array.isArray(v) ? v[0] : v;
        if (typeof s === "string" && s.trim()) return s.trim();
      }
    }
    return null;
  };

  const candidate =
    profile.email?.trim() ||
    attr("email", "emailaddress", "mail", "urn:oid:0.9.2342.19200300.100.1.3") ||
    (typeof profile.nameID === "string" && EMAIL_RE.test(profile.nameID) ? profile.nameID : null);

  const first = attr("givenname", "firstname", "urn:oid:2.5.4.42");
  const last = attr("surname", "lastname", "sn", "urn:oid:2.5.4.4");
  const name =
    attr("displayname", "name", "cn", "urn:oid:2.16.840.1.113730.3.1.241") ||
    ([first, last].filter(Boolean).join(" ").trim() || null);

  return { email: (candidate ?? "").toLowerCase(), name };
}

/**
 * JIT provisioning for an SSO login: find-or-create the user (no password; the IdP
 * vouches for the email) and ensure they're a member of the connection's org with
 * the configured default role. Unlike a normal signup, an SSO user joins the
 * EXISTING enterprise org — we don't create a new org for them. Returns the org's
 * live workspace so the session lands there.
 */
export async function upsertSamlMember(params: {
  email: string;
  name: string | null;
  organizationId: string;
  defaultRole: MembershipRole;
}): Promise<{ user: User; liveWorkspaceId: string | null }> {
  const email = params.email.toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        id: newId("user"),
        email,
        name: params.name,
        passwordHash: null,
        emailVerifiedAt: new Date(), // the IdP asserted this address
      })
      .returning();
  } else if (!user.emailVerifiedAt) {
    const now = new Date();
    await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, user.id));
    user.emailVerifiedAt = now;
  }

  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, params.organizationId)))
    .limit(1);
  if (!existing) {
    await db.insert(memberships).values({
      id: newId("membership"),
      userId: user.id,
      organizationId: params.organizationId,
      role: params.defaultRole,
    });
  }

  const [live] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.organizationId, params.organizationId), eq(workspaces.environment, "live")),
    )
    .limit(1);

  return { user, liveWorkspaceId: live?.id ?? null };
}
