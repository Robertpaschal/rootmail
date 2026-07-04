import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env, Errors, type MembershipRole, newId, randomToken, sha256Hex } from "@rootmail/core";
import { db, ssoConnections } from "@rootmail/db";
import { createSession, userWorkspaces } from "../lib/auth";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { serializeUser, serializeWorkspace } from "../lib/serialize";
import { acsUrl, extractIdentity, metadataXml, samlFor, spEntityId, upsertSamlMember } from "../lib/saml";
import { parse } from "../lib/validate";

// The auth-flow endpoints live under /v1/auth/* (public-allowlisted) but are called
// by the dashboard server-side and gated by the shared internal secret, exactly like
// /v1/auth/oauth. The dashboard relays the browser/IdP so it can set the rm_session
// cookie. Admin CRUD (/v1/sso/connection) uses normal session auth + the sso feature.

function assertInternal(req: FastifyRequest): void {
  if (!env.INTERNAL_API_SECRET) throw Errors.notFound("SSO is not enabled.");
  if (req.headers["x-rootmail-internal"] !== env.INTERNAL_API_SECRET) throw Errors.unauthorized();
}

function domainOf(email: string): string {
  return email.toLowerCase().split("@")[1] ?? "";
}

function serializeConnection(c: typeof ssoConnections.$inferSelect) {
  return {
    object: "sso_connection" as const,
    id: c.id,
    email_domain: c.emailDomain,
    idp_entity_id: c.idpEntityId,
    idp_sso_url: c.idpSsoUrl,
    default_role: c.defaultRole,
    enforced: c.enforced,
    active: c.active,
    // The SP values the customer pastes into their IdP.
    sp_entity_id: spEntityId(c.id),
    acs_url: acsUrl(c.id),
    metadata_url: `${env.PUBLIC_API_URL}/v1/auth/saml/${c.id}/metadata`,
    // SCIM provisioning status + where the IdP points (the token is shown only once,
    // on generation — we store just its hash).
    scim_enabled: c.scimTokenHash != null,
    scim_base_url: `${env.PUBLIC_API_URL}/scim/v2`,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

const upsertBody = z.object({
  email_domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a valid email domain, e.g. acme.com"),
  idp_entity_id: z.string().trim().min(1),
  idp_sso_url: z.string().trim().url(),
  // Optional on update — blank keeps the stored cert (so it's never sent back to
  // the client and re-submitted). Required on create (checked in the handler).
  idp_certificate: z.string().trim().optional(),
  default_role: z.enum(["admin", "member"]).default("member"),
  enforced: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function samlRoutes(app: FastifyInstance): Promise<void> {
  // --- Public: SP metadata the IdP admin imports --------------------------
  app.get("/v1/auth/saml/:id/metadata", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [conn] = await db.select().from(ssoConnections).where(eq(ssoConnections.id, id)).limit(1);
    if (!conn) throw Errors.notFound("Connection not found");
    return reply.type("application/xml").send(metadataXml(conn));
  });

  // --- Discovery: does this email's domain use SSO? -----------------------
  app.post("/v1/auth/sso/discover", async (req) => {
    assertInternal(req);
    const { email } = parse(z.object({ email: z.string().trim().email() }), req.body);
    const [conn] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.emailDomain, domainOf(email)), eq(ssoConnections.active, true)))
      .limit(1);
    return conn
      ? { object: "sso_discovery", connection_id: conn.id, enforced: conn.enforced }
      : { object: "sso_discovery", connection_id: null, enforced: false };
  });

  // --- SP-initiated: build the AuthnRequest redirect ----------------------
  app.post("/v1/auth/saml/:id/authorize", async (req) => {
    assertInternal(req);
    const { id } = req.params as { id: string };
    const [conn] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, id), eq(ssoConnections.active, true)))
      .limit(1);
    if (!conn) throw Errors.notFound("Connection not found");
    const url = await samlFor(conn).getAuthorizeUrlAsync("", undefined, {});
    return { object: "sso_authorize", url };
  });

  // --- ACS: validate the IdP response, JIT provision, mint a session ------
  app.post("/v1/auth/saml/:id/acs", async (req, reply) => {
    assertInternal(req);
    const { id } = req.params as { id: string };
    const { saml_response } = parse(
      z.object({ saml_response: z.string().min(1) }),
      req.body,
    );
    const [conn] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.id, id), eq(ssoConnections.active, true)))
      .limit(1);
    if (!conn) throw Errors.notFound("Connection not found");

    let profile;
    try {
      const result = await samlFor(conn).validatePostResponseAsync({ SAMLResponse: saml_response });
      profile = result.profile;
    } catch (err) {
      req.log.warn({ err, connection: id }, "saml response validation failed");
      throw Errors.unauthorized("We couldn't verify the sign-in from your identity provider.");
    }
    if (!profile) throw Errors.unauthorized("No identity in the SAML response.");

    const { email, name } = extractIdentity(profile);
    if (!email) throw Errors.unauthorized("Your identity provider didn't send an email address.");
    // Bind logins to the connection's domain — the IdP can't provision users outside it.
    if (domainOf(email) !== conn.emailDomain) {
      throw Errors.unauthorized(`This connection only accepts @${conn.emailDomain} addresses.`);
    }

    const { user, liveWorkspaceId } = await upsertSamlMember({
      email,
      name,
      organizationId: conn.organizationId,
      defaultRole: conn.defaultRole as MembershipRole,
    });

    const { token, session } = await createSession(user.id, liveWorkspaceId);
    const workspaces = await userWorkspaces(user.id);
    const active = workspaces.find((w) => w.id === liveWorkspaceId) ?? workspaces[0] ?? null;
    return reply.status(200).send({
      object: "session",
      user: serializeUser(user),
      workspaces: workspaces.map(serializeWorkspace),
      active_workspace: active ? serializeWorkspace(active) : null,
      session_token: token,
      session_expires_at: session.expiresAt,
    });
  });

  // --- Admin: the org's single SSO connection (enterprise, session auth) ---
  app.get("/v1/sso/connection", async (req) => {
    const org = await requireFeature(req, "sso");
    const [conn] = await db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.organizationId, org.id))
      .limit(1);
    return { object: "sso_connection_result", connection: conn ? serializeConnection(conn) : null };
  });

  app.put("/v1/sso/connection", async (req) => {
    const org = await requireFeature(req, "sso");
    await requirePermission(req, "members.manage");
    const orgId = org.id;
    const body = parse(upsertBody, req.body);

    // The domain must be unique across orgs (it routes "Log in with SSO").
    const [domainOwner] = await db
      .select({ id: ssoConnections.id, organizationId: ssoConnections.organizationId })
      .from(ssoConnections)
      .where(eq(ssoConnections.emailDomain, body.email_domain))
      .limit(1);
    if (domainOwner && domainOwner.organizationId !== orgId) {
      throw Errors.conflict(`${body.email_domain} is already connected to another organization.`);
    }

    const [existing] = await db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.organizationId, orgId))
      .limit(1);

    const certificate = body.idp_certificate || existing?.idpCertificate;
    if (!certificate) {
      throw Errors.badRequest("The IdP signing certificate is required.");
    }

    const values = {
      emailDomain: body.email_domain,
      idpEntityId: body.idp_entity_id,
      idpSsoUrl: body.idp_sso_url,
      idpCertificate: certificate,
      defaultRole: body.default_role,
      enforced: body.enforced,
      active: body.active,
      updatedAt: new Date(),
    };

    const [saved] = existing
      ? await db.update(ssoConnections).set(values).where(eq(ssoConnections.id, existing.id)).returning()
      : await db
          .insert(ssoConnections)
          .values({ id: newId("ssoConnection"), organizationId: orgId, ...values })
          .returning();
    return serializeConnection(saved);
  });

  app.delete("/v1/sso/connection", async (req) => {
    const org = await requireFeature(req, "sso");
    await requirePermission(req, "members.manage");
    await db.delete(ssoConnections).where(eq(ssoConnections.organizationId, org.id));
    return { object: "sso_connection_result", connection: null };
  });

  // --- SCIM provisioning token (shown once) -------------------------------
  app.post("/v1/sso/scim/token", async (req) => {
    const org = await requireFeature(req, "sso");
    await requirePermission(req, "members.manage");
    const [conn] = await db
      .select({ id: ssoConnections.id })
      .from(ssoConnections)
      .where(eq(ssoConnections.organizationId, org.id))
      .limit(1);
    if (!conn) throw Errors.badRequest("Set up a SAML connection before enabling SCIM provisioning.");
    const token = `rmscim_${randomToken(24)}`;
    await db
      .update(ssoConnections)
      .set({ scimTokenHash: sha256Hex(token), updatedAt: new Date() })
      .where(eq(ssoConnections.id, conn.id));
    return { object: "scim_token", token, base_url: `${env.PUBLIC_API_URL}/scim/v2` };
  });

  app.delete("/v1/sso/scim/token", async (req) => {
    const org = await requireFeature(req, "sso");
    await requirePermission(req, "members.manage");
    await db
      .update(ssoConnections)
      .set({ scimTokenHash: null, updatedAt: new Date() })
      .where(eq(ssoConnections.organizationId, org.id));
    return { object: "scim_token", token: null };
  });
}
