import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  findScimMember,
  findScimMemberByEmail,
  listScimMembers,
  provisionScimMember,
  resolveScim,
  scimBaseUrl,
  scimUser,
  type ScimContext,
  setMemberActive,
  updateScimMember,
  SCIM_ERROR_SCHEMA,
  SCIM_LIST_SCHEMA,
} from "../lib/scim";

// SCIM 2.0 provisioning endpoints, authenticated per-org by the SCIM bearer token
// (not the app's session/key auth — /scim is public-allowlisted so this hook owns
// it). Just enough for Okta/Entra: ServiceProviderConfig + Users CRUD, where the
// deprovision path (PATCH active=false / DELETE) is the one that matters most.

const SCIM_TYPE = "application/scim+json";

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const [scheme, token] = h.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token?.trim() : undefined;
}

function scimError(reply: FastifyReply, status: number, detail: string) {
  return reply
    .code(status)
    .type(SCIM_TYPE)
    .send({ schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail });
}

async function auth(req: FastifyRequest, reply: FastifyReply): Promise<ScimContext | null> {
  const ctx = await resolveScim(bearer(req));
  if (!ctx) {
    scimError(reply, 401, "Invalid or missing SCIM bearer token.");
    return null;
  }
  return ctx;
}

// Parse the flexible SCIM User body into our shape.
function parseUser(body: unknown): { email: string; name: string | null; active: boolean; externalId: string | null } {
  const b = (body ?? {}) as Record<string, any>;
  const email = String(b.userName ?? b.emails?.[0]?.value ?? "").trim().toLowerCase();
  const name =
    (typeof b.displayName === "string" && b.displayName.trim()) ||
    [b.name?.givenName, b.name?.familyName].filter(Boolean).join(" ").trim() ||
    null;
  return {
    email,
    name: name || null,
    active: b.active !== false,
    externalId: b.externalId ? String(b.externalId) : null,
  };
}

// Extract an `active` decision from a PATCH Operations array, tolerant of the two
// shapes Okta/Entra send: {path:"active",value:x} and {value:{active:x}}.
function patchActive(body: unknown): boolean | null {
  const ops = (body as any)?.Operations;
  if (!Array.isArray(ops)) return null;
  for (const op of ops) {
    if (typeof op?.op === "string" && ["replace", "add"].includes(op.op.toLowerCase())) {
      if (typeof op.path === "string" && op.path.toLowerCase() === "active") {
        return op.value === true || op.value === "true" || op.value === false || op.value === "false"
          ? op.value === true || op.value === "true"
          : null;
      }
      if (op.value && typeof op.value === "object" && "active" in op.value) {
        return op.value.active === true || op.value.active === "true";
      }
    }
  }
  return null;
}

export async function scimRoutes(app: FastifyInstance): Promise<void> {
  app.get("/scim/v2/ServiceProviderConfig", async (req, reply) => {
    if (!(await auth(req, reply))) return;
    return reply.type(SCIM_TYPE).send({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: `${scimBaseUrl()}`,
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        { type: "oauthbearertoken", name: "OAuth Bearer Token", description: "Per-org SCIM token" },
      ],
    });
  });

  app.get("/scim/v2/Users", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const q = req.query as Record<string, string>;
    const filter = q.filter ?? "";
    // Okta probes existence with: userName eq "x" (and sometimes externalId eq "x").
    const m = /^\s*(userName|externalId)\s+eq\s+"([^"]+)"/i.exec(filter);
    let members = await listScimMembers(ctx.organizationId);
    if (m) {
      const [, field, value] = m;
      members =
        field.toLowerCase() === "username"
          ? members.filter((x) => x.user.email === value.toLowerCase())
          : members.filter((x) => x.externalId === value);
    }
    const startIndex = Math.max(1, Number(q.startIndex) || 1);
    const count = q.count !== undefined ? Math.max(0, Number(q.count) || 0) : members.length;
    const page = members.slice(startIndex - 1, startIndex - 1 + count);
    return reply.type(SCIM_TYPE).send({
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: members.length,
      startIndex,
      itemsPerPage: page.length,
      Resources: page.map(scimUser),
    });
  });

  app.post("/scim/v2/Users", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const input = parseUser(req.body);
    if (!input.email) return scimError(reply, 400, "userName (email) is required.");

    const existing = await findScimMemberByEmail(ctx.organizationId, input.email);
    if (existing) {
      // Already a member — SCIM says 409; the IdP will GET/PATCH instead.
      return reply
        .code(409)
        .type(SCIM_TYPE)
        .send({ schemas: [SCIM_ERROR_SCHEMA], status: "409", detail: "User already provisioned.", scimType: "uniqueness" });
    }
    const member = await provisionScimMember(ctx, input);
    return reply.code(201).type(SCIM_TYPE).send(scimUser(member));
  });

  app.get("/scim/v2/Users/:id", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const member = await findScimMember(ctx.organizationId, (req.params as { id: string }).id);
    if (!member) return scimError(reply, 404, "User not found.");
    return reply.type(SCIM_TYPE).send(scimUser(member));
  });

  app.put("/scim/v2/Users/:id", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const member = await findScimMember(ctx.organizationId, (req.params as { id: string }).id);
    if (!member) return scimError(reply, 404, "User not found.");
    const input = parseUser(req.body);
    await updateScimMember(member, { name: input.name, externalId: input.externalId });
    if (input.active !== member.active) await setMemberActive(member, input.active);
    const fresh = await findScimMember(ctx.organizationId, member.membershipId);
    return reply.type(SCIM_TYPE).send(scimUser(fresh ?? member));
  });

  app.patch("/scim/v2/Users/:id", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const member = await findScimMember(ctx.organizationId, (req.params as { id: string }).id);
    if (!member) return scimError(reply, 404, "User not found.");
    const active = patchActive(req.body);
    if (active !== null && active !== member.active) await setMemberActive(member, active);
    const fresh = await findScimMember(ctx.organizationId, member.membershipId);
    return reply.type(SCIM_TYPE).send(scimUser(fresh ?? member));
  });

  app.delete("/scim/v2/Users/:id", async (req, reply) => {
    const ctx = await auth(req, reply);
    if (!ctx) return;
    const member = await findScimMember(ctx.organizationId, (req.params as { id: string }).id);
    if (!member) return scimError(reply, 404, "User not found.");
    // Soft deprovision — deactivate + kill sessions, keep the record for re-activation.
    await setMemberActive(member, false);
    return reply.code(204).send();
  });
}
