import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  auditEmailAuth,
  buildDnsRecords,
  clearThrottle,
  encryptSecret,
  enqueueWebhookEvent,
  env,
  Errors,
  generateDkimKeypair,
  isVerified,
  newId,
  randomToken,
  REPUTATION_THRESHOLDS,
  verifyDnsRecords,
} from "@rootmail/core";
import { auditEntries, db, type SubTenant, subTenants, workspaces } from "@rootmail/db";
import { loadOrg, requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { getAddon, getPlan } from "../lib/plans";
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
    const included = getPlan(org.plan).includedSubTenants;
    if (included !== -1) {
      const packs = await addonQuantity(org.id, "subtenant_pack");
      const ceiling = included + packs * getAddon("subtenant_pack").grant;
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
        // Encrypted at rest: a dump of this table would otherwise hand over every
        // tenant's signing key, and DKIM keys have no expiry. The worker decrypts
        // at send time. See packages/core/src/encryption.ts.
        dkimPrivateKey: encryptSecret(dkim.privateKeyPem),
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

  // --- Email-authentication posture (SPF / DKIM / DMARC / BIMI) -----------
  app.get("/v1/sub-tenants/:id/auth", async (req) => {
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);
    const report = await auditEmailAuth({
      domain: st.sendingDomain,
      verificationToken: st.verificationToken,
      dkimSelector: st.dkimSelector,
      dkimValue: st.dkimPublicKey,
    });
    return { object: "email_auth", sub_tenant_id: st.id, ...report };
  });

  // --- Rename / retag -----------------------------------------------------
  // Client domains were create-and-read only: every other collection in the API
  // (campaigns, contacts, lists, sequences, templates, senders, webhooks, roles)
  // can be edited and removed, so an agency could add a client and then never
  // correct a typo in their name or take them off the account. The sending
  // DOMAIN itself stays immutable — it's what the DKIM key and every verified
  // DNS record are bound to; changing it would silently invalidate them, so
  // that case is "remove it and add the right one".
  app.patch("/v1/sub-tenants/:id", async (req) => {
    await requirePermission(req, "domains.manage");
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);
    const body = parse(
      z.object({
        name: z.string().min(1).max(120).optional(),
        external_id: z.string().max(120).nullable().optional(),
        inherits_templates: z.boolean().optional(),
      }),
      req.body,
    );

    const [updated] = await db
      .update(subTenants)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.external_id !== undefined ? { externalId: body.external_id } : {}),
        ...(body.inherits_templates !== undefined
          ? { inheritsTemplates: body.inherits_templates }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(subTenants.id, st.id))
      .returning();

    return serializeSubTenant(updated, { includeDns: true });
  });

  // --- Remove -------------------------------------------------------------
  app.delete("/v1/sub-tenants/:id", async (req) => {
    await requirePermission(req, "domains.manage");
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);
    await db.delete(subTenants).where(eq(subTenants.id, st.id));
    return { object: "sub_tenant", id: st.id, deleted: true };
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

    // A reputation pause outranks DNS. Without this, re-running verification on a
    // paused client would flip `status` back to "verified" and quietly reopen the
    // send path — a pause anyone can clear by pressing the button next to it.
    const paused = st.reputationState === "paused";

    const [updated] = await db
      .update(subTenants)
      .set({
        status: paused ? "disabled" : verified ? "verified" : "failed",
        lastCheckedAt: new Date(),
        verifiedAt: verified ? new Date() : st.verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(subTenants.id, st.id))
      .returning();

    return { ...serializeSubTenant(updated, { includeDns: true }), verified, checks };
  });

  // --- Reputation history -------------------------------------------------
  // Every warn / throttle / pause / resume this client has been through, with the
  // numbers that caused each one. A pause the operator cannot explain to their own
  // customer is a support ticket they cannot answer.
  app.get("/v1/sub-tenants/:id/reputation", async (req) => {
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);
    const trail = await db
      .select()
      .from(auditEntries)
      .where(and(eq(auditEntries.subTenantId, st.id), isNull(auditEntries.messageId)))
      .orderBy(desc(auditEntries.occurredAt))
      .limit(100);

    return {
      object: "reputation",
      sub_tenant_id: st.id,
      state: st.reputationState,
      score: st.reputationScore,
      reason: st.reputationReason,
      metrics: st.reputationMetrics,
      checked_at: st.reputationCheckedAt,
      changed_at: st.reputationChangedAt,
      resumed_at: st.reputationResumedAt,
      thresholds: REPUTATION_THRESHOLDS,
      history: trail.map((a) => ({
        event: a.event,
        occurred_at: a.occurredAt,
        actor: a.actor,
        ...a.metadata,
      })),
    };
  });

  // --- Resume a paused client ---------------------------------------------
  // The ladder out of the trap door. A pause with no documented way back is worse
  // than no pause at all: the operator's customer is dead in the water and the
  // only fix is a support ticket.
  app.post("/v1/sub-tenants/:id/resume", async (req) => {
    await requirePermission(req, "domains.manage");
    const { id } = req.params as { id: string };
    const st = await getScopedSubTenant(req, id);

    if (st.reputationState !== "paused") {
      throw Errors.badRequest(`"${st.name}" isn't paused (reputation state: ${st.reputationState}).`);
    }

    const now = new Date();
    const [updated] = await db
      .update(subTenants)
      .set({
        reputationState: "ok",
        reputationReason: null,
        reputationChangedAt: now,
        // The sweep judges a resumed tenant only on mail sent after this moment —
        // otherwise the same trailing window that paused them re-pauses them
        // within fifteen minutes and the resume button does nothing.
        reputationResumedAt: now,
        // A tenant can only reach paused from verified, so this is where it returns.
        status: "verified",
        updatedAt: now,
      })
      .where(eq(subTenants.id, st.id))
      .returning();

    // The throttle meter is keyed per tenant and would otherwise still be metering
    // a client we just let back in.
    await clearThrottle(st.id).catch(() => {});

    await db.insert(auditEntries).values({
      id: newId("audit"),
      workspaceId: st.workspaceId,
      subTenantId: st.id,
      messageId: null,
      event: "tenant_resumed",
      actor: req.auth.user ? "user" : "api_key",
      actorId: req.auth.user?.id ?? req.auth.apiKey?.id ?? null,
      metadata: {
        from_state: "paused",
        to_state: "ok",
        reason: "Resumed by the parent workspace.",
        previous_reason: st.reputationReason,
        previous_metrics: st.reputationMetrics,
      },
    });

    void enqueueWebhookEvent({
      workspaceId: st.workspaceId,
      subTenantId: st.id,
      event: "tenant.resumed",
      data: {
        sub_tenant_id: st.id,
        sending_domain: st.sendingDomain,
        state: "ok",
        previous_state: "paused",
        occurred_at: now.toISOString(),
      },
    });

    return serializeSubTenant(updated, { includeDns: true });
  });
}
