import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  appendBrandingFooter,
  appendComplianceFooter,
  wingBrandingRequired,
  enqueueSend,
  env,
  Errors,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  newId,
  PRIORITIES,
  render,
  sha256Hex,
  signProof,
  unsubscribeUrl,
} from "@rootmail/core";
import {
  activeReplyDomain,
  assets,
  auditEntries,
  db,
  messages,
  type Message,
  type MessageAttachment,
  openConversationForSend,
  organizations,
  resolveReplyTo,
  subTenants,
  type SubTenant,
  type Workspace,
} from "@rootmail/db";
import { writeAudit } from "../lib/audit";
import {
  assertEmailVerified,
  assertMarketingSendCapacity,
  planFor,
  recordMarketingSend,
  recordSend,
  sendKindOf,
  tryConsumeMarketing,
  tryConsumeQuota,
} from "../lib/billing";
import { requireFeature } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { defaultSenderFor, verifiedSenderFor } from "../lib/senders";
import { addSuppression, findContact, isSuppressed, loadTemplate } from "../lib/queries";
import { serializeAudit, serializeMessage } from "../lib/serialize";
import { parse } from "../lib/validate";

const emailAddress = z.object({ email: z.string().email(), name: z.string().optional() });

const sendBody = z.object({
  to: z.union([z.string().email(), emailAddress]),
  type: z.enum(MESSAGE_TYPES).default("transactional"),
  from: z.union([z.string().email(), emailAddress]).optional(),
  reply_to: z.string().email().optional(),
  subject: z.string().optional(),
  template: z.string().optional(),
  template_id: z.string().optional(),
  variables: z.record(z.unknown()).default({}),
  html: z.string().optional(),
  text: z.string().optional(),
  send_at: z.string().datetime().optional(),
  priority: z.enum(PRIORITIES).default("normal"),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  idempotency_key: z.string().min(1).optional(),
  sub_tenant_id: z.string().optional(),
  // File attachments — each references an uploaded asset (POST /v1/assets) by id.
  attachments: z.array(z.object({ id: z.string() })).max(10).optional(),
});

// Email attachments are constrained by inbox size caps — SES rejects over ~40MB
// and most providers strip past 25MB, so we hold the per-email total to 20MB.
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MESSAGE_STATUSES).optional(),
  // "true" → only sandbox sends (the test inbox); "false" → only live mail.
  sandbox: z.enum(["true", "false"]).optional(),
});

const eventBody = z.object({
  event: z.enum(["delivered", "opened", "clicked", "bounced", "complained"]),
  url: z.string().url().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  reason: z.string().optional(),
});

type FromInput = string | { email: string; name?: string } | undefined;

async function resolveFrom(
  from: FromInput,
  subTenant: SubTenant | null,
  workspace: Workspace,
): Promise<{ email: string; name?: string }> {
  if (typeof from === "string") return { email: from };
  if (from) return { email: from.email, name: from.name };
  if (subTenant) return { email: `no-reply@${subTenant.sendingDomain}`, name: subTenant.name };
  // No address named → send from the org's own verified sender if it set one up
  // (the whole point of "send from your own email"); else the rootmail no-reply.
  const own = await defaultSenderFor(workspace.organizationId);
  if (own) return { email: own.email, name: own.displayName ?? workspace.name };
  return { email: `no-reply@${env.ROOTMAIL_DOMAIN}`, name: workspace.name };
}

async function getScopedMessage(req: FastifyRequest, id: string): Promise<Message> {
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.workspaceId, req.auth.workspace.id)))
    .limit(1);
  if (!message) throw Errors.notFound(`Message ${id} not found`);
  return message;
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // --- Send ---------------------------------------------------------------
  app.post("/v1/messages", async (req, reply) => {
    await requirePermission(req, "messages.send");
    const body = parse(sendBody, req.body);
    const { workspace, subTenant: headerSub, mode, apiKey, user } = req.auth;
    // Who's sending: an API key (SDK) or a logged-in dashboard user.
    const sender = apiKey
      ? { actor: "api_key", actorId: apiKey.id }
      : user
        ? { actor: "user", actorId: user.id }
        : { actor: "system", actorId: null };

    // Resolve the effective sub-tenant (header wins; body must agree).
    let subTenant = headerSub;
    if (body.sub_tenant_id) {
      if (headerSub && headerSub.id !== body.sub_tenant_id) {
        throw Errors.badRequest("sub_tenant_id conflicts with the X-Rootmail-Subtenant header");
      }
      if (!headerSub) {
        const [st] = await db
          .select()
          .from(subTenants)
          .where(
            and(eq(subTenants.id, body.sub_tenant_id), eq(subTenants.workspaceId, workspace.id)),
          )
          .limit(1);
        if (!st) throw Errors.notFound(`Sub-tenant ${body.sub_tenant_id} not found`);
        subTenant = st;
      }
    }

    // Downgrade guard: sending through a sub-tenant requires the subtenants
    // feature on the current plan, so an org that downgraded away from it can't
    // keep sending through its existing sub-tenants. 402 feature_locked.
    if (subTenant) await requireFeature(req, "subtenants");

    if (subTenant && subTenant.status !== "verified" && mode === "live") {
      throw Errors.badRequest(
        `Sub-tenant ${subTenant.id} domain "${subTenant.sendingDomain}" is not verified (status: ${subTenant.status})`,
      );
    }

    const subTenantId = subTenant?.id ?? null;
    const toEmail = typeof body.to === "string" ? body.to : body.to.email;

    // Idempotency fast path.
    if (body.idempotency_key) {
      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspace.id),
            eq(messages.idempotencyKey, body.idempotency_key),
          ),
        )
        .limit(1);
      if (existing) {
        void reply.header("Idempotent-Replayed", "true");
        return reply.status(200).send(serializeMessage(existing));
      }
    }

    // Per-wing enforcement: TRANSACTIONAL sends reserve against the block
    // allowance; marketing/sales sends are covered by the contact-priced marketing
    // wing (recorded for visibility, never billed against blocks).
    const sendKind = sendKindOf(body.type);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, workspace.organizationId))
      .limit(1);
    // Verify the sender, then atomically reserve quota (transactional only). The
    // reserve is the single source of truth for the cap (no read-then-write race);
    // replays are short-circuited by the idempotency check above.
    if (mode === "live" && org) {
      await assertEmailVerified(org);
      if (sendKind === "transactional") {
        if (!(await tryConsumeQuota(org))) {
          const plan = planFor(org);
          throw Errors.quotaExceeded(
            `You've used your free ${plan.monthlyQuota.toLocaleString()} transactional emails this month. Buy send blocks (25,000 emails each) to keep sending.`,
            { quota: plan.monthlyQuota, wing: "transactional", upgrade_url: "/billing/transactional" },
          );
        }
      } else if (!(await tryConsumeMarketing(org))) {
        // Marketing volume is metered against the contact-scaled monthly + daily caps.
        await assertMarketingSendCapacity(org, 1); // throws the specific 402 (monthly vs daily)
      }
    }

    // Resolve content from a template or inline html.
    let subjectSrc = body.subject;
    let htmlSrc = body.html;
    let textSrc = body.text ?? null;
    let templateId: string | null = null;
    let templateVersion: number | null = null;

    if (body.template || body.template_id) {
      const tpl = await loadTemplate(workspace.id, subTenantId, {
        slug: body.template,
        id: body.template_id,
      });
      if (!tpl) throw Errors.notFound(`Template "${body.template ?? body.template_id}" not found`);
      templateId = tpl.id;
      templateVersion = tpl.currentVersion;
      subjectSrc = body.subject ?? tpl.subject;
      htmlSrc = tpl.html;
      textSrc = tpl.text ?? null;
    }

    if (!subjectSrc || !htmlSrc) {
      throw Errors.validation(
        "Provide a `template`/`template_id`, or both `subject` and `html`.",
      );
    }

    // Inject a signed, per-recipient unsubscribe URL so {{unsubscribe_url}} in
    // a template footer resolves to a tamper-proof link (ours wins over any
    // caller-supplied value of the same name).
    const variables = {
      ...body.variables,
      unsubscribe_url: unsubscribeUrl({ w: workspace.id, e: toEmail, s: subTenantId }),
    };

    let rendered = render({
      subject: subjectSrc,
      html: htmlSrc,
      text: textSrc,
      variables,
    });
    // CAN-SPAM: marketing/sales mail must carry the sender's postal address + an
    // unsubscribe link. Inject BEFORE hashing so the Layer-3 proof matches the
    // email actually sent. Transactional mail is exempt.
    if (body.type === "marketing" || body.type === "sales") {
      rendered = {
        ...rendered,
        ...appendComplianceFooter(rendered, {
          postalAddress: org?.postalAddress ?? null,
          unsubscribeUrl: variables.unsubscribe_url,
        }),
      };
    }
    // Free-plan live mail carries the small "Sent with rootmail" footer (removed by
    // upgrading). After compliance, before the hash — so proof matches what's sent.
    if (mode === "live" && org && wingBrandingRequired(body.type, org)) {
      rendered = { ...rendered, ...appendBrandingFooter(rendered, { url: env.MARKETING_URL }) };
    }
    const contentHash = sha256Hex(rendered.html);
    const from = await resolveFrom(body.from, subTenant, workspace);
    // A caller-chosen From must be an address the org actually controls: a
    // verified sender identity, the sub-tenant's verified domain, or the platform
    // domain — otherwise SES would reject it downstream with a cryptic error.
    if (body.from) {
      const fromDomain = from.email.split("@")[1]?.toLowerCase() ?? "";
      const tenantDomain = subTenant && fromDomain === subTenant.sendingDomain.toLowerCase();
      const platformDomain = fromDomain === env.ROOTMAIL_DOMAIN.toLowerCase();
      const verified = org ? await verifiedSenderFor(org.id, from.email) : null;
      if (!tenantDomain && !platformDomain && !verified) {
        throw Errors.validation(
          `"${from.email}" isn't a verified sender for this organization. Verify it under Settings → Sending, or leave From empty to use your workspace address.`,
        );
      }
    }
    const contact = await findContact(workspace.id, subTenantId, toEmail);
    const suppressed = await isSuppressed(workspace.id, subTenantId, toEmail);

    // Resolve attachment references to owned assets (scoped to the workspace),
    // preserving the caller's order. The worker fetches the bytes at send time.
    let messageAttachments: MessageAttachment[] = [];
    if (body.attachments?.length) {
      const ids = [...new Set(body.attachments.map((a) => a.id))];
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.workspaceId, workspace.id), inArray(assets.id, ids)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const missing = ids.filter((i) => !byId.has(i));
      if (missing.length) throw Errors.notFound(`Attachment not found: ${missing.join(", ")}`);
      messageAttachments = body.attachments.map((a) => {
        const r = byId.get(a.id)!;
        return { url: r.url, filename: r.filename, content_type: r.contentType, size: r.size };
      });
      const total = messageAttachments.reduce((s, a) => s + a.size, 0);
      if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
        throw Errors.validation(
          `Attachments total ${(total / 1048576).toFixed(1)}MB — the limit is 20MB per email.`,
        );
      }
    }

    const id = newId("message");
    const sendAt = body.send_at ? new Date(body.send_at) : null;

    const insertedRows = await db
      .insert(messages)
      .values({
        id,
        workspaceId: workspace.id,
        subTenantId,
        type: body.type,
        toEmail,
        toContactId: contact?.id ?? null,
        fromEmail: from.email,
        fromName: from.name ?? null,
        // Only an explicit caller Reply-To is stamped here; the org's reply mode
        // (capture into the Replies inbox vs. the sender's own mailbox) is resolved
        // once the conversation is opened below.
        replyTo: body.reply_to ?? null,
        subject: rendered.subject,
        templateId,
        templateVersion,
        variables,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
        contentHash,
        sendAt,
        priority: body.priority,
        tags: body.tags,
        metadata: body.metadata,
        attachments: messageAttachments,
        idempotencyKey: body.idempotency_key ?? null,
        status: suppressed ? "suppressed" : "queued",
        sandbox: mode === "test",
      })
      .onConflictDoNothing()
      .returning();

    // Lost an idempotency race — return the winner.
    if (insertedRows.length === 0) {
      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.workspaceId, workspace.id),
            eq(messages.idempotencyKey, body.idempotency_key ?? ""),
          ),
        )
        .limit(1);
      if (!existing) throw Errors.internal("Insert conflict could not be resolved");
      // This request reserved quota above but produced no new send (the winner
      // did) — refund the reservation so the duplicate doesn't over-count.
      if (mode === "live" && org) {
        if (sendKind === "marketing") await recordMarketingSend(org.id, -1);
        else await recordSend(org.id, -1, sendKind);
      }
      void reply.header("Idempotent-Replayed", "true");
      return reply.status(200).send(serializeMessage(existing));
    }

    const message = insertedRows[0];

    // Roll this send into the recipient's conversation (Layer 2) and stamp the
    // Reply-To per the org's reply mode — capture into the Replies inbox by
    // default, the sender's own mailbox if they chose that, an explicit Reply-To
    // always wins. Best-effort: threading never fails the send.
    try {
      const thread = await openConversationForSend({
        workspaceId: workspace.id,
        subTenantId,
        contactEmail: toEmail,
        subject: rendered.subject,
        fromEmail: from.email,
        messageId: message.id,
        bodyHtml: rendered.html,
        bodyText: rendered.text,
      });
      const replyTo = resolveReplyTo({
        replyMode: org?.replyMode ?? null,
        conversationId: thread.id,
        fromEmail: from.email,
        explicit: body.reply_to ?? null,
        replyDomain: org ? activeReplyDomain(org) : null,
      });
      if (replyTo !== message.replyTo) {
        await db.update(messages).set({ replyTo, updatedAt: new Date() }).where(eq(messages.id, message.id));
        message.replyTo = replyTo;
      }
    } catch {
      /* threading is non-critical to the send */
    }

    await writeAudit(db, {
      workspaceId: workspace.id,
      subTenantId,
      messageId: id,
      event: "queued",
      actor: sender.actor,
      actorId: sender.actorId,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (suppressed) {
      await writeAudit(db, {
        workspaceId: workspace.id,
        subTenantId,
        messageId: id,
        event: "suppressed",
        actor: "system",
        metadata: { reason: "recipient is on the suppression list" },
      });
      return reply.status(200).send(serializeMessage(message));
    }

    const delayMs = sendAt ? Math.max(0, sendAt.getTime() - Date.now()) : 0;
    await enqueueSend({ messageId: id, workspaceId: workspace.id }, { priority: body.priority, delayMs });

    return reply.status(202).send(serializeMessage(message));
  });

  // --- List ---------------------------------------------------------------
  app.get("/v1/messages", async (req) => {
    const q = parse(listQuery, req.query);
    const conditions = [eq(messages.workspaceId, req.auth.workspace.id)];
    if (q.status) conditions.push(eq(messages.status, q.status));
    if (q.sandbox) conditions.push(eq(messages.sandbox, q.sandbox === "true"));
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(q.limit);
    // Engagement (first open/click) lives on the audit trail, not the message
    // row — join it in one grouped query so each row can show how far it got.
    const engagement = new Map<string, { openedAt?: Date; clickedAt?: Date }>();
    if (rows.length) {
      const ev = await db
        .select({
          messageId: auditEntries.messageId,
          event: auditEntries.event,
          at: sql<Date>`min(${auditEntries.occurredAt})`,
        })
        .from(auditEntries)
        .where(
          and(
            inArray(auditEntries.messageId, rows.map((r) => r.id)),
            inArray(auditEntries.event, ["opened", "clicked"]),
          ),
        )
        .groupBy(auditEntries.messageId, auditEntries.event);
      for (const e of ev) {
        if (!e.messageId) continue;
        const cur = engagement.get(e.messageId) ?? {};
        if (e.event === "opened") cur.openedAt = e.at;
        else cur.clickedAt = e.at;
        engagement.set(e.messageId, cur);
      }
    }
    return { object: "list", data: rows.map((m) => serializeMessage(m, engagement.get(m.id))) };
  });

  // --- Retrieve -----------------------------------------------------------
  app.get("/v1/messages/:id", async (req) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const [ev] = await db
      .select({
        openedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'opened')`,
        clickedAt: sql<Date | null>`min(${auditEntries.occurredAt}) filter (where ${auditEntries.event} = 'clicked')`,
      })
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id));
    return serializeMessage(message, ev ?? undefined);
  });

  // --- Audit trail --------------------------------------------------------
  app.get("/v1/messages/:id/audit", async (req) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const trail = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id))
      .orderBy(asc(auditEntries.occurredAt));
    return { message_id: message.id, status: message.status, trail: trail.map(serializeAudit) };
  });

  // --- Layer 3 proof bundle (Enterprise) ----------------------------------
  // An Ed25519-signed, exportable record of what was sent + its full lifecycle.
  app.get("/v1/messages/:id/proof", async (req) => {
    await requireFeature(req, "proof");
    await requirePermission(req, "proof.read");
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const trail = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.messageId, message.id))
      .orderBy(asc(auditEntries.occurredAt));

    const bundle = {
      message_id: message.id,
      content_hash: message.contentHash,
      subject: message.subject,
      to: message.toEmail,
      from: message.fromEmail,
      status: message.status,
      workspace_id: message.workspaceId,
      created_at: message.createdAt.toISOString(),
      audit: trail.map((a) => ({
        event: a.event,
        occurred_at: a.occurredAt.toISOString(),
        actor: a.actor,
      })),
      issued_at: new Date().toISOString(),
    };
    return { object: "proof", bundle, ...signProof(bundle) };
  });

  // --- Record a lifecycle event (provider callback / simulation) ----------
  app.post("/v1/messages/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const message = await getScopedMessage(req, id);
    const body = parse(eventBody, req.body);

    await writeAudit(db, {
      workspaceId: message.workspaceId,
      subTenantId: message.subTenantId,
      messageId: message.id,
      event: body.event,
      actor: "system",
      ip: body.ip ?? null,
      userAgent: body.user_agent ?? null,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      metadata: {
        simulated: true,
        ...(body.url ? { url: body.url } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
      },
    });

    const statusForEvent: Partial<Record<typeof body.event, Message["status"]>> = {
      delivered: "delivered",
      bounced: "bounced",
      complained: "complained",
    };
    const nextStatus = statusForEvent[body.event];
    if (nextStatus) {
      // Persist the reason onto the message so get_message surfaces *why* it
      // bounced/complained (mirrors the real SES feedback path).
      const carriesReason = body.event === "bounced" || body.event === "complained";
      await db
        .update(messages)
        .set({
          status: nextStatus,
          ...(carriesReason && body.reason ? { error: body.reason } : {}),
          updatedAt: new Date(),
        })
        .where(eq(messages.id, message.id));
    }

    if (body.event === "bounced" || body.event === "complained") {
      await addSuppression(
        message.workspaceId,
        message.subTenantId,
        message.toEmail,
        body.event === "bounced" ? "bounce" : "complaint",
        message.id,
      );
    }

    return reply.status(202).send({ ok: true, message_id: message.id, event: body.event });
  });
}
