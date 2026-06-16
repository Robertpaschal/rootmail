import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { enqueueWebhookEvent, Errors, THREAD_STATUSES } from "@rootmail/core";
import { db, organizations, type Thread, threadMessages, threads } from "@rootmail/db";
import { assertCanSend } from "../lib/billing";
import { requireFeature } from "../lib/features";
import { authActor, dispatchMessage } from "../lib/dispatch";
import { exitEnrollments } from "../lib/sequence-triggers";
import {
  appendInbound,
  appendOutbound,
  findThreadForReply,
  threadReplyFrom,
} from "../lib/threads";
import { requirePermission } from "../lib/permissions";
import { serializeThread } from "../lib/serialize";
import { parse } from "../lib/validate";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const listQuery = z.object({
  status: z.enum(THREAD_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const replyBody = z.object({
  html: z.string().optional(),
  text: z.string().optional(),
});

const inboundBody = z.object({
  from: z.string().email(),
  to: z.string().email(),
  in_reply_to: z.string().min(1),
  subject: z.string().optional(),
  body_html: z.string().optional(),
  body_text: z.string().optional(),
});

const simulateBody = z.object({
  body_text: z.string().default("Thanks — can you tell me more?"),
});

function scopeOf(req: FastifyRequest): string | null {
  return req.auth.subTenant?.id ?? null;
}

async function getScopedThread(req: FastifyRequest, id: string): Promise<Thread> {
  const subTenantId = scopeOf(req);
  const [t] = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.id, id),
        eq(threads.workspaceId, req.auth.workspace.id),
        subTenantId ? eq(threads.subTenantId, subTenantId) : isNull(threads.subTenantId),
      ),
    )
    .limit(1);
  if (!t) throw Errors.notFound(`Thread ${id} not found`);
  return t;
}

export async function threadRoutes(app: FastifyInstance): Promise<void> {
  // Conversation (Layer 2) is a Pro+ capability. Gate the whole plugin — the
  // hook runs after the global auth hook has populated req.auth.
  app.addHook("preHandler", async (req) => {
    await requireFeature(req, "threads");
  });

  // --- List ---------------------------------------------------------------
  app.get("/v1/threads", async (req) => {
    const q = parse(listQuery, req.query);
    const subTenantId = scopeOf(req);
    const conditions = [eq(threads.workspaceId, req.auth.workspace.id)];
    conditions.push(subTenantId ? eq(threads.subTenantId, subTenantId) : isNull(threads.subTenantId));
    if (q.status) conditions.push(eq(threads.status, q.status));

    const rows = await db
      .select()
      .from(threads)
      .where(and(...conditions))
      .orderBy(desc(threads.lastMessageAt))
      .limit(q.limit);
    return { object: "list", data: rows.map((t) => serializeThread(t)) };
  });

  // --- Retrieve (with messages) -------------------------------------------
  app.get("/v1/threads/:id", async (req) => {
    const { id } = req.params as { id: string };
    const thread = await getScopedThread(req, id);
    const msgs = await db
      .select()
      .from(threadMessages)
      .where(eq(threadMessages.threadId, thread.id))
      .orderBy(asc(threadMessages.createdAt));
    return serializeThread(thread, msgs);
  });

  // --- Reply --------------------------------------------------------------
  // Sends the reply through the real pipeline (render → queue → provider) and
  // records it on the thread, linked to the message it created.
  app.post("/v1/threads/:id/reply", async (req) => {
    await requirePermission(req, "messages.send");
    const { id } = req.params as { id: string };
    const body = parse(replyBody, req.body);
    if (!body.html && !body.text) throw Errors.validation("Provide `html` or `text` to reply.");
    const thread = await getScopedThread(req, id);
    const fromEmail =
      (await threadReplyFrom(thread.id)) ?? `no-reply@${req.auth.workspace.slug}.rootmail.dev`;

    // Replies count against the monthly quota like any other live send.
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.auth.workspace.organizationId))
      .limit(1);
    if (req.auth.mode === "live" && org) await assertCanSend(org);

    const html = body.html ?? `<p>${escapeHtml(body.text ?? "").replace(/\n/g, "<br/>")}</p>`;
    const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;

    const { message } = await dispatchMessage({
      workspace: req.auth.workspace,
      subTenantId: thread.subTenantId,
      org: org ?? null,
      mode: req.auth.mode,
      type: "transactional",
      to: thread.contactEmail,
      fromEmail,
      replyTo: fromEmail,
      subject,
      html,
      text: body.text ?? null,
      actor: authActor(req.auth),
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });

    await appendOutbound(thread, {
      fromEmail,
      toEmail: thread.contactEmail,
      bodyHtml: message.renderedHtml,
      bodyText: message.renderedText,
      messageId: message.id,
    });
    return serializeThread(await getScopedThread(req, id));
  });

  // --- Simulate an inbound reply (demo; no real inbound provider yet) ------
  app.post("/v1/threads/:id/simulate-reply", async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(simulateBody, req.body);
    const thread = await getScopedThread(req, id);
    const to = (await threadReplyFrom(thread.id)) ?? "inbox@rootmail.dev";

    await appendInbound(thread, {
      fromEmail: thread.contactEmail,
      toEmail: to,
      bodyText: body.body_text,
    });
    const msgs = await db
      .select()
      .from(threadMessages)
      .where(eq(threadMessages.threadId, thread.id))
      .orderBy(asc(threadMessages.createdAt));
    return serializeThread(await getScopedThread(req, id), msgs);
  });

  // --- Inbound ingestion (provider webhook target) ------------------------
  // Matches the reply to its thread via `in_reply_to` (a message or thread id).
  app.post("/v1/inbound", async (req) => {
    const body = parse(inboundBody, req.body);
    const thread = await findThreadForReply(req.auth.workspace.id, body.in_reply_to);
    if (!thread) throw Errors.notFound(`No thread matches in_reply_to "${body.in_reply_to}"`);

    await appendInbound(thread, {
      fromEmail: body.from,
      toEmail: body.to,
      bodyHtml: body.body_html ?? null,
      bodyText: body.body_text ?? null,
    });
    void enqueueWebhookEvent({
      workspaceId: req.auth.workspace.id,
      subTenantId: thread.subTenantId,
      event: "message.received",
      data: { thread_id: thread.id, from: body.from, occurred_at: new Date().toISOString() },
    });
    // A reply exits the sender from any sequence configured to exit-on-reply.
    void exitEnrollments(req.auth.workspace.id, body.from, "replied");
    return { object: "thread", id: thread.id, status: "needs_reply" };
  });
}
