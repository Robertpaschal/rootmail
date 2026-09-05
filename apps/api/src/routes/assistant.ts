import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env, Errors, newId } from "@rootmail/core";
import {
  type AssistantChat,
  type AssistantMessage,
  assistantChats,
  assistantMessages,
  db,
} from "@rootmail/db";
import { generateChatTitle, type PriorTurn, runAssistant } from "../lib/assistant";
import { getAiUsage, recordAiUse, tryConsumeAiCredit } from "../lib/billing";
import { aiCreditsForOrg } from "../lib/plans";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { parse } from "../lib/validate";

const DEFAULT_TITLE = "New chat";

/** Atomically reserve one AI credit, or throw 402 (with the upgrade path) when the
 * org is at its monthly cap. Returns the reserved usage count (-1 when unlimited). */
async function reserveAiCreditOrThrow(orgId: string, allowance: number): Promise<number> {
  const reserved = await tryConsumeAiCredit(orgId, allowance);
  if (reserved === null) {
    throw Errors.quotaExceeded(
      `You've used all ${allowance} AI credits this month. Upgrade your plan or add an AI credit pack.`,
      {
        feature: "ai_credits",
        used: allowance,
        allowance,
        upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing?tab=plans`,
      },
    );
  }
  return reserved;
}

/** Reconcile the reserved credit against the real model-call count (calls=0 for a
 * keyless/failed run refunds it), and return the used count to report in the reply. */
async function settleAiCredits(
  orgId: string,
  allowance: number,
  reserved: number,
  calls: number,
): Promise<number> {
  if (allowance === -1) return getAiUsage(orgId); // unlimited: report raw usage
  const delta = calls - 1; // one credit was already reserved atomically
  if (delta !== 0) await recordAiUse(orgId, delta);
  return reserved + delta;
}

/** Identify the session user behind a request; chats are owned per-user. */
function requireUser(req: FastifyRequest): { id: string } {
  if (!req.auth.user) {
    throw Errors.forbidden("Assistant chats require a signed-in user session.");
  }
  return req.auth.user;
}

/** Load a chat that belongs to BOTH the caller's org and user, or 404. */
async function getOwnedChat(req: FastifyRequest, orgId: string, id: string): Promise<AssistantChat> {
  const user = requireUser(req);
  const [chat] = await db
    .select()
    .from(assistantChats)
    .where(
      and(
        eq(assistantChats.id, id),
        eq(assistantChats.organizationId, orgId),
        eq(assistantChats.userId, user.id),
        req.auth.subTenant
          ? eq(assistantChats.subTenantId, req.auth.subTenant.id)
          : isNull(assistantChats.subTenantId),
      ),
    )
    .limit(1);
  if (!chat) throw Errors.notFound(`Chat ${id} not found`);
  return chat;
}

function serializeChat(c: AssistantChat) {
  return {
    object: "assistant_chat" as const,
    id: c.id,
    title: c.title,
    sub_tenant_id: c.subTenantId,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

function serializeMessage(m: AssistantMessage) {
  return {
    object: "assistant_message" as const,
    id: m.id,
    role: m.role,
    content: m.content,
    actions: m.actions ?? [],
    created_at: m.createdAt.toISOString(),
  };
}

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  // Current AI-credit balance — a cheap read so the dashboard can show the meter
  // and nudge proactively (not only after a send). allowance -1 = unlimited.
  app.get("/v1/assistant/credits", async (req) => {
    const org = await loadOrg(req);
    const allowance = await aiCreditsForOrg(org);
    const used = await getAiUsage(org.id);
    return {
      object: "ai_credits" as const,
      used,
      allowance,
      remaining: allowance === -1 ? -1 : Math.max(0, allowance - used),
    };
  });

  // The assistant runs agentically and calls other routes; meter it against AI
  // credits (per-tier allocation + buyable packs) and cap bursts per-route.
  app.post(
    "/v1/assistant",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      await requirePermission(req, "content.manage");
      const { prompt } = parse(z.object({ prompt: z.string().min(1).max(2000) }), req.body);
      const org = await loadOrg(req);

      const allowance = await aiCreditsForOrg(org);
      const reserved = await reserveAiCreditOrThrow(org.id, allowance);

      // Charge 1 credit per model call the assistant actually made (1 for a quick
      // reply, up to 10 for a multi-step build/operate/diagnose run). One credit is
      // reserved atomically above; settleAiCredits reconciles the rest and refunds a
      // keyless/failed run (which makes no model calls and is free).
      const result = await runAssistant(app, req, prompt);
      const used = await settleAiCredits(org.id, allowance, reserved, result.calls);

      return {
        object: "assistant_response",
        reply: result.reply,
        actions: result.actions,
        source: result.source,
        credits: { used, allowance },
      };
    },
  );

  // --- Persistent chats (per org + user) ----------------------------------

  // Create an empty chat. The title defaults to "New chat" and is auto-set from
  // the first user prompt the first time a message is posted.
  app.post("/v1/assistant/chats", async (req, reply) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    const user = requireUser(req);
    const body = parse(z.object({ title: z.string().min(1).max(120).optional() }), req.body ?? {});
    const [chat] = await db
      .insert(assistantChats)
      .values({
        id: newId("assistantChat"),
        organizationId: org.id,
        userId: user.id,
        // Pin the conversation to whatever client the operator was viewing when
        // they started it — see the column's note in schema.ts.
        subTenantId: req.auth.subTenant?.id ?? null,
        title: body.title?.trim() || DEFAULT_TITLE,
      })
      .returning();
    return reply.status(201).send(serializeChat(chat));
  });

  // List the caller's chats, newest activity first.
  app.get("/v1/assistant/chats", async (req) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    const user = requireUser(req);
    const rows = await db
      .select()
      .from(assistantChats)
      .where(
        and(
          eq(assistantChats.organizationId, org.id),
          eq(assistantChats.userId, user.id),
          // Same shape as templates/contacts: a client's chats belong to that
          // client, and the workspace rail shows only workspace-level ones.
          req.auth.subTenant
            ? eq(assistantChats.subTenantId, req.auth.subTenant.id)
            : isNull(assistantChats.subTenantId),
        ),
      )
      .orderBy(desc(assistantChats.updatedAt));
    return { object: "list", data: rows.map(serializeChat) };
  });

  // A chat plus its ordered messages.
  app.get("/v1/assistant/chats/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const chat = await getOwnedChat(req, org.id, id);
    const msgs = await db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.chatId, chat.id))
      .orderBy(asc(assistantMessages.createdAt));
    return { ...serializeChat(chat), messages: msgs.map(serializeMessage) };
  });

  // Post a message into a chat. Loads the chat's prior turns as history, runs the
  // assistant with that context, persists the user message + the assistant reply
  // (with its actions), bumps updated_at, and auto-titles a still-default chat.
  // This is the metered path now (credits gating + recording identical to /v1/assistant).
  app.post(
    "/v1/assistant/chats/:id/messages",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      await requirePermission(req, "content.manage");
      const org = await loadOrg(req);
      const { id } = req.params as { id: string };
      const chat = await getOwnedChat(req, org.id, id);
      const { prompt } = parse(z.object({ prompt: z.string().min(1).max(2000) }), req.body);

      const allowance = await aiCreditsForOrg(org);
      const reserved = await reserveAiCreditOrThrow(org.id, allowance);

      // Replay this chat's prior text turns for context.
      const priors = await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.chatId, chat.id))
        .orderBy(asc(assistantMessages.createdAt));
      const history: PriorTurn[] = priors.map((m) => ({ role: m.role, content: m.content }));

      const result = await runAssistant(app, req, prompt, history);
      const used = await settleAiCredits(org.id, allowance, reserved, result.calls);

      // Persist the turn pair (user prompt, then assistant reply + actions).
      const now = new Date();
      await db.insert(assistantMessages).values([
        {
          id: newId("assistantMessage"),
          chatId: chat.id,
          role: "user",
          content: prompt,
          actions: null,
          createdAt: now,
        },
        {
          id: newId("assistantMessage"),
          chatId: chat.id,
          role: "assistant",
          content: result.reply,
          actions: result.actions,
          createdAt: new Date(now.getTime() + 1),
        },
      ]);

      // Bump activity; name a still-default chat from the conversation's content.
      const title =
        chat.title === DEFAULT_TITLE ? await generateChatTitle(prompt, result.reply) : chat.title;
      await db
        .update(assistantChats)
        .set({ updatedAt: now, title })
        .where(eq(assistantChats.id, chat.id));

      return {
        object: "assistant_response",
        reply: result.reply,
        actions: result.actions,
        source: result.source,
        chat: { id: chat.id, title },
        credits: { used, allowance },
      };
    },
  );

  /**
   * The same turn, streamed.
   *
   * Identical gating, billing and persistence to the route above — the only
   * difference is that the caller watches it happen instead of waiting on one
   * blob. Server-Sent Events, because the payload is one-directional and text:
   *
   *   event: tool   {"tool":"list_threads","status":200}
   *   event: delta  {"text":"Let me check your recent sends…"}
   *   event: done   {"reply":…,"actions":[…],"chat":{…},"credits":{…}}
   *   event: error  {"error":"…"}
   *
   * The plain route stays: the SDK, the mock path and anything that just wants a
   * response body still use it, and streaming must never become the only way in.
   */
  app.post(
    "/v1/assistant/chats/:id/messages/stream",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      await requirePermission(req, "content.manage");
      const org = await loadOrg(req);
      const { id } = req.params as { id: string };
      const chat = await getOwnedChat(req, org.id, id);
      const { prompt } = parse(z.object({ prompt: z.string().min(1).max(2000) }), req.body);

      const allowance = await aiCreditsForOrg(org);
      const reserved = await reserveAiCreditOrThrow(org.id, allowance);

      const priors = await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.chatId, chat.id))
        .orderBy(asc(assistantMessages.createdAt));
      const history: PriorTurn[] = priors.map((m) => ({ role: m.role, content: m.content }));

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // nginx buffers proxied responses by default, which would hold every
        // event until the run ended and defeat the whole exercise.
        "X-Accel-Buffering": "no",
      });
      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await runAssistant(app, req, prompt, history, (e) => {
          if (e.type === "delta") send("delta", { text: e.text });
          else send("tool", { tool: e.tool, status: e.status });
        });
        const used = await settleAiCredits(org.id, allowance, reserved, result.calls);

        const now = new Date();
        await db.insert(assistantMessages).values([
          {
            id: newId("assistantMessage"),
            chatId: chat.id,
            role: "user",
            content: prompt,
            actions: null,
            createdAt: now,
          },
          {
            id: newId("assistantMessage"),
            chatId: chat.id,
            role: "assistant",
            content: result.reply,
            actions: result.actions,
            createdAt: new Date(now.getTime() + 1),
          },
        ]);

        const title =
          chat.title === DEFAULT_TITLE ? await generateChatTitle(prompt, result.reply) : chat.title;
        await db
          .update(assistantChats)
          .set({ updatedAt: now, title })
          .where(eq(assistantChats.id, chat.id));

        send("done", {
          reply: result.reply,
          actions: result.actions,
          source: result.source,
          chat: { id: chat.id, title },
          credits: { used, allowance },
        });
      } catch (err) {
        // The reserve already happened, so settle at zero rather than leaving a
        // credit held against a run that produced nothing.
        await settleAiCredits(org.id, allowance, reserved, 0).catch(() => {});
        req.log.error({ err }, "assistant stream failed");
        send("error", { error: "The assistant couldn't finish that. Nothing was charged." });
      } finally {
        reply.raw.end();
      }
    },
  );

  // Rename a chat — the auto-title is only a starting point.
  app.patch("/v1/assistant/chats/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const chat = await getOwnedChat(req, org.id, id);
    const { title } = parse(z.object({ title: z.string().trim().min(1).max(120) }), req.body);
    const [updated] = await db
      .update(assistantChats)
      .set({ title }) // a rename isn't "activity" — don't bump updated_at / reorder the rail
      .where(eq(assistantChats.id, chat.id))
      .returning();
    return serializeChat(updated);
  });

  app.delete("/v1/assistant/chats/:id", async (req) => {
    await requirePermission(req, "content.manage");
    const org = await loadOrg(req);
    const { id } = req.params as { id: string };
    const chat = await getOwnedChat(req, org.id, id);
    await db.delete(assistantChats).where(eq(assistantChats.id, chat.id));
    return { object: "assistant_chat", id: chat.id, deleted: true };
  });
}
