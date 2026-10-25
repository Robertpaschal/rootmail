import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, AUTH_CONTENT_POLICY, AUTH_SUBJECT, assertAuthLifetime, authRequestFingerprint,
  checkAndCount, enqueueSend, env, Errors, getAuthContentVault, newId, ORG_SENDS_PER_MINUTE,
  scanContent, sha256Hex, testRecipientFor } from "@rootmail/core";
import { db, isPlatformBetaFrom, messages, organizations, orgSendingProviders, unverifiedSendRecipients } from "@rootmail/db";
import { writeAudit } from "../lib/audit";
import { assertEmailVerified, assertTransactionalSendCapacity, recordSend, recordTransactionalDaily, tryConsumeQuota } from "../lib/billing";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { isSuppressed } from "../lib/queries";
import { serializeMessage } from "../lib/serialize";
import { assertSenderAllowed } from "../lib/senders";

const bodySchema = z.object({
  policy: z.literal(AUTH_CONTENT_POLICY),
  to: z.string().email().max(254),
  from: z.string().email().max(254),
  reply_to: z.string().email().max(254).optional(),
  html: z.string().min(1).max(64_000),
  text: z.string().max(32_000),
  expires_at: z.string().datetime(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
}).strict();

/** Explicit versioned endpoint: old servers 404, never silently strip a privacy flag. */
export async function authMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/auth-messages/capabilities", async (req, reply) => {
    if (!env.AUTH_MESSAGES_ENABLED) throw new AppError(503, "auth_unavailable", "Authentication sending is unavailable");
    await requirePermission(req, "messages.send");
    if (!req.auth.apiKey || req.auth.mode !== "live") throw Errors.forbidden("Live server key required");
    return reply.header("cache-control", "no-store").send({ policy: AUTH_CONTENT_POLICY,
      workspace_id: req.auth.workspace.id, sub_tenant_id: req.auth.subTenant?.id ?? null, provider: env.MAIL_PROVIDER });
  });
  app.post("/v1/auth-messages", { bodyLimit: 128 * 1024 }, async (req, reply) => {
    if (!env.AUTH_MESSAGES_ENABLED) throw new AppError(503, "auth_unavailable", "Authentication sending is unavailable");
    await requirePermission(req, "messages.send");
    const { workspace, subTenant, apiKey, mode } = req.auth;
    if (!apiKey || mode !== "live") throw Errors.forbidden("Authentication mail requires a live server API key");
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw Errors.validation("Invalid authentication message"); // never echo rejected values/field names
    const body = parsed.data;
    if (body.reply_to?.toLowerCase().startsWith("reply+")) {
      throw Errors.validation("Authentication mail must not use a conversation capture address");
    }
    const authExpiresAt = new Date(body.expires_at);
    assertAuthLifetime(authExpiresAt);
    if (testRecipientFor(body.to)) throw Errors.validation("Authentication mail cannot use simulator recipients");
    if (subTenant) {
      await requireFeature(req, "subtenants");
      if (subTenant.status !== "verified" || subTenant.reputationState === "paused") throw Errors.forbidden("Client cannot send");
    }
    if (workspace.reputationState === "paused") throw Errors.forbidden("Workspace cannot send");

    const [org] = await db.select().from(organizations).where(eq(organizations.id, workspace.organizationId)).limit(1);
    if (!org || org.sendingSuspended) throw Errors.forbidden("Account cannot send");
    // First implementation only supports our SES path. Never switch a BYO customer onto it.
    const [connection] = await db.select({ id: orgSendingProviders.id }).from(orgSendingProviders)
      .where(eq(orgSendingProviders.organizationId, org.id)).limit(1);
    if (connection || org.byoProvider || org.dedicatedIpStatus === "active") {
      throw Errors.badRequest("Authentication sending is not supported for this provider configuration");
    }
    await assertEmailVerified(org);
    await assertSenderAllowed({ fromEmail: body.from, organizationId: org.id, subTenantDomain: subTenant?.sendingDomain });
    if (isPlatformBetaFrom(body.from) && (!body.reply_to || isPlatformBetaFrom(body.reply_to))) {
      throw Errors.validation("Authentication mail from a beta address needs an explicit reply mailbox");
    }
    if ((await unverifiedSendRecipients(workspace.id, [body.to])).length) throw Errors.validation("Recipient is not confirmed");
    if (scanContent({ html: body.html, text: body.text, attachments: [], blockedHosts: (env.BLOCKED_LINK_HOSTS ?? "").split(",").filter(Boolean) }).length) {
      throw Errors.validation("Authentication content was refused");
    }
    const subTenantId = subTenant?.id ?? null;
    // Namespaced by authenticated scope; a client cannot collide with another client or ordinary mail.
    const idempotencyKey = `auth_${sha256Hex(JSON.stringify([workspace.id, subTenantId, body.idempotency_key]))}`;
    const fingerprint = authRequestFingerprint([workspace.id, subTenantId, body.to, body.from, body.reply_to ?? null,
      body.html, body.text, authExpiresAt.toISOString()]);
    const existingQuery = () => db.select().from(messages).where(and(eq(messages.workspaceId, workspace.id), eq(messages.idempotencyKey, idempotencyKey))).limit(1);
    const replay = async (existing: typeof messages.$inferSelect) => {
      if (existing.subTenantId !== subTenantId || existing.authRequestFingerprint !== fingerprint) {
        throw Errors.conflict("Authentication idempotency key was reused with different input");
      }
      if (existing.status === "queued") {
        // Recover an enqueue failure without replacing content, extending expiry or charging again.
        await enqueueSend({ messageId: existing.id, workspaceId: workspace.id }, { priority: "high", singleAttempt: true });
      }
      return reply.header("Idempotent-Replayed", "true").status(200).send(serializeMessage(existing));
    };
    const [existing] = await existingQuery();
    if (existing) return replay(existing);
    if (await isSuppressed(workspace.id, subTenantId, body.to, "transactional")) throw Errors.conflict("Recipient is suppressed");
    const burst = await checkAndCount(`send:${org.id}`, ORG_SENDS_PER_MINUTE, 60);
    if (!burst.allowed) throw Errors.rateLimited("Authentication send rate exceeded");
    const vault = getAuthContentVault();
    await vault.assertEphemeral();
    const scope = { id: newId("message"), workspaceId: workspace.id, subTenantId, authExpiresAt };
    await vault.put(scope, { html: body.html, text: body.text });
    let charged = false;
    let inserted = false;
    try {
      charged = await tryConsumeQuota(org);
      if (!charged) {
        await assertTransactionalSendCapacity(org, 1);
        throw Errors.quotaExceeded(); // fail closed if capacity changed between checks
      }
      assertAuthLifetime(authExpiresAt);
      const [message] = await db.insert(messages).values({
        ...scope, type: "transactional", toEmail: body.to, fromEmail: body.from,
        replyTo: body.reply_to ?? null, subject: AUTH_SUBJECT,
        priority: "high", idempotencyKey, authRequestFingerprint: fingerprint, status: "queued", sandbox: false,
      }).onConflictDoNothing().returning();
      if (!message) {
        const [winner] = await existingQuery();
        if (!winner) throw Errors.internal();
        return await replay(winner);
      }
      inserted = true;
      await writeAudit(db, { workspaceId: workspace.id, subTenantId, messageId: message.id,
        event: "queued", actor: "api_key", actorId: apiKey.id });
      await enqueueSend({ messageId: message.id, workspaceId: workspace.id }, { priority: "high", singleAttempt: true });
      return reply.status(202).send(serializeMessage(message));
    } finally {
      if (!inserted) {
        await vault.discard(scope);
        if (charged) {
          await recordSend(org.id, -1, "transactional");
          await recordTransactionalDaily(org.id, -1);
        }
      }
    }
  });
}
