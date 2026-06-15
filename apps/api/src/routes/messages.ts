import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  enqueueSend,
  env,
  Errors,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  newId,
  PRIORITIES,
  render,
  sha256Hex,
  unsubscribeUrl,
} from "@rootmail/core";
import {
  auditEntries,
  db,
  messages,
  type Message,
  organizations,
  subTenants,
  type SubTenant,
  type Workspace,
} from "@rootmail/db";
import { writeAudit } from "../lib/audit";
import { assertCanSend, recordSend } from "../lib/billing";
import { openThreadForSend } from "../lib/threads";
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
});

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MESSAGE_STATUSES).optional(),
});

const eventBody = z.object({
  event: z.enum(["delivered", "opened", "clicked", "bounced", "complained"]),
  url: z.string().url().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  reason: z.string().optional(),
});

type FromInput = string | { email: string; name?: string } | undefined;

function resolveFrom(
  from: FromInput,
  subTenant: SubTenant | null,
  workspace: Workspace,
): { email: string; name?: string } {
  if (typeof from === "string") return { email: from };
  if (from) return { email: from.email, name: from.name };
  if (subTenant) return { email: `no-reply@${subTenant.sendingDomain}`, name: subTenant.name };
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

    // Plan enforcement — live sends count against the org's monthly quota.
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, workspace.organizationId))
      .limit(1);
    if (mode === "live" && org) await assertCanSend(org);

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

    const rendered = render({
      subject: subjectSrc,
      html: htmlSrc,
      text: textSrc,
      variables,
    });
    const contentHash = sha256Hex(rendered.html);
    const from = resolveFrom(body.from, subTenant, workspace);
    const contact = await findContact(workspace.id, subTenantId, toEmail);
    const suppressed = await isSuppressed(workspace.id, subTenantId, toEmail);

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
      void reply.header("Idempotent-Replayed", "true");
      return reply.status(200).send(serializeMessage(existing));
    }

    const message = insertedRows[0];

    // Meter the live send against the monthly quota (sandbox is free).
    if (mode === "live" && org) await recordSend(org.id);

    // Open a conversation thread (Layer 2) — best-effort, never fails the send.
    try {
      await openThreadForSend(message);
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
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(q.limit);
    return { object: "list", data: rows.map(serializeMessage) };
  });

  // --- Retrieve -----------------------------------------------------------
  app.get("/v1/messages/:id", async (req) => {
    const { id } = req.params as { id: string };
    return serializeMessage(await getScopedMessage(req, id));
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
      await db
        .update(messages)
        .set({ status: nextStatus, updatedAt: new Date() })
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
