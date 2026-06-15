import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ADD_ONS,
  buildDnsRecords,
  env,
  Errors,
  generateDkimKeypair,
  isVerified,
  newId,
  PLANS,
  randomToken,
  verifyDnsRecords,
} from "@rootmail/core";
import { db, type SubTenant, subTenants, workspaces } from "@rootmail/db";
import { loadOrg, requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { addonQuantity } from "../lib/seats";
import { serializeSubTenant } from "../lib/serialize";
import { parse } from "../lib/validate";

const createBody = z.object({
  name: z.string().min(1),
  external_id: z.string().optional(),
  sending_domain: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Must be a valid domain like sunsetvillas.com"),
  inherits_templates_from: z.enum(["parent", "none"]).default("parent"),
});

async function getScopedSubTenant(req: FastifyRequest, id: string): Promise<SubTenant> {
  const [st] = await db
    .select()
    .from(subTenants)
    .where(and(eq(subTenants.id, id), eq(subTenants.workspaceId, req.auth.workspace.id)))
    .limit(1);
  if (!st) throw Errors.notFound(`Sub-tenant ${id} not found`);
  return st;
}

export async function subTenantRoutes(app: FastifyInstance): Promise<void> {
  // Sub-tenancy is a Scale+ capability. Gate the whole plugin — the hook runs
  // after the global auth hook has populated req.auth.
  app.addHook("preHandler", async (req) => {
    await requireFeature(req, "subtenants");
  });

  // --- Provision ----------------------------------------------------------
  app.post("/v1/sub-tenants", async (req, reply) => {
    await requirePermission(req, "domains.manage");
    const body = parse(createBody, req.body);
    const { workspace } = req.auth;
    const domain = body.sending_domain.toLowerCase();

    const [dupe] = await db
      .select({ id: subTenants.id })
      .from(subTenants)
      .where(and(eq(subTenants.workspaceId, workspace.id), eq(subTenants.sendingDomain, domain)))
      .limit(1);
    if (dupe) {
      throw Errors.conflict(`A sub-tenant for ${domain} already exists`, { sub_tenant_id: dupe.id });
    }

    // Enforce the sub-tenant ceiling (plan-included + purchased packs), org-wide.
    const org = await loadOrg(req);
    const included = PLANS[org.plan].includedSubTenants;
    if (included !== -1) {
      const packs = await addonQuantity(org.id, "subtenant_pack");
      const ceiling = included + packs * ADD_ONS.subtenant_pack.grant;
      const wsIds = (
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, org.id))
      ).map((w) => w.id);
      const existing = wsIds.length
        ? await db.select({ id: subTenants.id }).from(subTenants).where(inArray(subTenants.workspaceId, wsIds))
        : [];
      if (existing.length >= ceiling) {
        throw Errors.featureLocked("sub_tenant_capacity", {
          current_plan: org.plan,
          required_plan: null,
          message: `You've reached your ${ceiling} sub-tenant limit. Add a sub-tenant pack or upgrade your plan.`,
          upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
          checkout_endpoint: 'POST /v1/billing/addons {"addon_id":"subtenant_pack","quantity":N}',
        });
      }
    }

    const dkim = generateDkimKeypair(env.DKIM_SELECTOR);
    const id = newId("subTenant");

    const [row] = await db
      .insert(subTenants)
      .values({
        id,
        workspaceId: workspace.id,
        name: body.name,
        externalId: body.external_id ?? null,
        sendingDomain: domain,
        status: "pending_verification",
        inheritsTemplates: body.inherits_templates_from === "parent",
        verificationToken: randomToken(),
        dkimSelector: dkim.selector,
        dkimPublicKey: dkim.dnsValue,
        dkimPrivateKey: dkim.privateKeyPem,
      })
      .returning();

    return reply.status(201).send(serializeSubTenant(row, { includeDns: true }));
  });

  // --- List ---------------------------------------------------------------
  app.get("/v1/sub-tenants", async (req) => {
    const rows = await db
      .select()
      .from(subTenants)
      .where(eq(subTenants.workspaceId, req.auth.workspace.id))
      .orderBy(desc(subTenants.createdAt));
    return { object: "list", data: rows.map((r) => serializeSubTenant(r)) };
  });

  // --- Retrieve (with DNS instructions) -----------------------------------
  app.get("/v1/sub-tenants/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serializeSubTenant(await getScopedSubTenant(req, id), { includeDns: true });
  });

  // --- Verify domain ------------------------------------------------------
  app.post("/v1/sub-tenants/:id/verify", async (req) => {
    await requirePermission(req, "domains.manage");
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);

    const records = buildDnsRecords({
      domain: st.sendingDomain,
      verificationToken: st.verificationToken,
      dkimSelector: st.dkimSelector,
      dkimValue: st.dkimPublicKey,
    });
    const checks = await verifyDnsRecords(records);
    const verified = isVerified(checks);

    const [updated] = await db
      .update(subTenants)
      .set({
        status: verified ? "verified" : "failed",
        lastCheckedAt: new Date(),
        verifiedAt: verified ? new Date() : st.verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(subTenants.id, st.id))
      .returning();

    return { ...serializeSubTenant(updated, { includeDns: true }), verified, checks };
  });
}
