import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { betaSenderAddress, env, Errors, newId } from "@rootmail/core";
import { db, senderIdentities, sendingAccess, threadReplyAddress, type SenderIdentity } from "@rootmail/db";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { betaSendingDomainReady, ensureDefaultSender, identityVerified, removeIdentity, setDefaultSender, startIdentityVerification } from "../lib/senders";
import { parse } from "../lib/validate";

// The org's own from-addresses. Adding one triggers SES's confirmation email to
// that mailbox; "check" refreshes the status; only verified addresses are usable
// as a custom From (enforced in the send route).

function serialize(s: SenderIdentity) {
  return {
    object: "sender_identity" as const,
    id: s.id,
    email: s.email,
    display_name: s.displayName,
    status: s.status as "pending" | "verified",
    is_default: s.isDefault,
    created_at: s.createdAt.toISOString(),
    verified_at: s.verifiedAt?.toISOString() ?? null,
  };
}

const createBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  display_name: z.string().trim().max(120).optional(),
});

export async function senderRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/senders/beta", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const access = await sendingAccess(req.auth.workspace.id);
    if (!org.isBeta || access.own_provider || access.provider !== "ses" || access.sandbox) {
      throw Errors.forbidden("The beta address is available in a beta account's Production workspace using Rootmail's SES sending account.");
    }
    if (!threadReplyAddress("beta-readiness")) {
      throw Errors.validation("Rootmail's beta reply service is not configured. Contact support; no address was activated.");
    }
    if (!(await betaSendingDomainReady())) {
      throw Errors.validation("Rootmail's beta sending domain is not ready. Contact support; no address was activated.");
    }
    const email = betaSenderAddress(org.id, env.ROOTMAIL_DOMAIN);
    const row = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`beta-sender:${org.id}`}, 0))`);
      const [existing] = await tx.select().from(senderIdentities).where(eq(senderIdentities.email, email)).limit(1);
      if (existing && existing.organizationId !== org.id) throw Errors.conflict("This beta address needs support to resolve its ownership.");
      await tx.update(senderIdentities).set({ isDefault: false }).where(eq(senderIdentities.organizationId, org.id));
      const [sender] = await tx.insert(senderIdentities).values({
        id: newId("senderIdentity"), organizationId: org.id, email,
        displayName: `${org.name || "Your workspace"} · Rootmail beta`, status: "verified", verifiedAt: new Date(), isDefault: true,
      }).onConflictDoUpdate({ target: senderIdentities.email, set: { isDefault: true, status: "verified", verifiedAt: new Date() } }).returning();
      return sender;
    });
    return serialize(row);
  });
  app.get("/v1/senders", async (req) => {
    const org = await loadOrg(req);
    const rows = await db
      .select()
      .from(senderIdentities)
      .where(eq(senderIdentities.organizationId, org.id))
      .orderBy(desc(senderIdentities.createdAt));
    return { object: "list", data: rows.map(serialize) };
  });

  app.post("/v1/senders", async (req, reply) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const b = parse(createBody, req.body);
    if (b.email.startsWith("beta+") && b.email.endsWith(`@${env.ROOTMAIL_DOMAIN.toLowerCase()}`)) {
      throw Errors.validation("Use the beta address setup instead of adding a managed address manually.");
    }

    const [existing] = await db
      .select({ orgId: senderIdentities.organizationId })
      .from(senderIdentities)
      .where(eq(senderIdentities.email, b.email))
      .limit(1);
    if (existing) {
      throw existing.orgId === org.id
        ? Errors.conflict("That address is already added.")
        : Errors.conflict("That address is connected to another organization.");
    }

    await startIdentityVerification(b.email);
    const [row] = await db
      .insert(senderIdentities)
      .values({
        id: newId("senderIdentity"),
        organizationId: org.id,
        email: b.email,
        displayName: b.display_name ?? null,
      })
      .returning();
    return reply.status(201).send(serialize(row));
  });

  // Refresh verification status from SES (the user clicks the link in the email
  // SES sent them, then comes back and checks).
  app.post("/v1/senders/:id/check", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(senderIdentities)
      .where(eq(senderIdentities.id, id))
      .limit(1);
    if (!row || row.organizationId !== org.id) throw Errors.notFound("Sender not found");

    if (row.status !== "verified" && (await identityVerified(row.email))) {
      const [updated] = await db
        .update(senderIdentities)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(eq(senderIdentities.id, row.id))
        .returning();
      // A newly-verified address becomes the default if the org had none.
      await ensureDefaultSender(org.id);
      const [fresh] = await db.select().from(senderIdentities).where(eq(senderIdentities.id, updated.id)).limit(1);
      return serialize(fresh ?? updated);
    }
    return serialize(row);
  });

  // Choose which verified address sends by default (campaigns + composes that
  // don't name a From use it).
  app.post("/v1/senders/:id/default", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(senderIdentities).where(eq(senderIdentities.id, id)).limit(1);
    if (!row || row.organizationId !== org.id) throw Errors.notFound("Sender not found");
    if (row.status !== "verified") throw Errors.badRequest("Verify the address before making it your default.");
    await setDefaultSender(org.id, row.id);
    return { object: "sender_identity", id: row.id, is_default: true };
  });

  app.delete("/v1/senders/:id", async (req) => {
    await requirePermission(req, "billing.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(senderIdentities)
      .where(eq(senderIdentities.id, id))
      .limit(1);
    if (!row || row.organizationId !== org.id) throw Errors.notFound("Sender not found");
    await removeIdentity(row.email);
    await db.delete(senderIdentities).where(eq(senderIdentities.id, row.id));
    // If the default was removed, promote another verified address.
    await ensureDefaultSender(org.id);
    return { object: "sender_identity", id: row.id, deleted: true };
  });
}
