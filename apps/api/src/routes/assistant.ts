import { and, asc, desc, eq } from "drizzle-orm";
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
import { getAiUsage, recordAiUse } from "../lib/billing";
import { aiCreditsForOrg, getAddon } from "../lib/plans";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { addonQuantity } from "../lib/seats";
import { parse } from "../lib/validate";

const DEFAULT_TITLE = "New chat";

/**
 * Resolve the AI-credit allowance for an org (tier allocation + bought packs).
 * -1 means unlimited. Shared by the single-shot and the per-chat message path.
 */
async function aiAllowance(orgId: string, base: number): Promise<number> {
  if (base === -1) return -1;
  const packs = await addonQuantity(orgId, "ai_credit_pack");
  return base + packs * getAddon("ai_credit_pack").grant;
}

/** Throw 402 quota_exceeded if the org has spent its AI credits. */
function assertAiCredits(used: number, allowance: number): void {
  if (allowance !== -1 && used >= allowance) {
    throw Errors.quotaExceeded(
      `You've used all ${allowance} AI credits this month. Upgrade your plan or add an AI credit pack.`,
      {
        feature: "ai_credits",
        used,
        allowance,
        upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
      },
    );
  }
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
  // The assistant runs agentically and calls other routes; meter it against AI
  // credits (per-tier allocation + buyable packs) and cap bursts per-route.
  app.post(
    "/v1/assistant",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      await requirePermission(req, "content.manage");
      const { prompt } = parse(z.object({ prompt: z.string().min(1).max(2000) }), req.body);
      const org = await loadOrg(req);

      const allowance = await aiAllowance(org.id, aiCreditsForOrg(org));
      const used = await getAiUsage(org.id);
      assertAiCredits(used, allowance);

      // Charge 1 credit per model call the assistant actually made (1 for a quick
      // reply, up to 8 for a multi-step build/operate/diagnose run) — credits track
      // real, token-bounded model calls, so heavier requests cost proportionally
      // more. A keyless mock run makes none and is free.
      const result = await runAssistant(app, req, prompt);
      if (allowance !== -1 && result.calls > 0) await recordAiUse(org.id, result.calls);

      return {
        object: "assistant_response",
        reply: result.reply,
        actions: result.actions,
        source: result.source,
        credits: { used: allowance === -1 ? used : used + result.calls, allowance },
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
      .where(and(eq(assistantChats.organizationId, org.id), eq(assistantChats.userId, user.id)))
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

      const allowance = await aiAllowance(org.id, aiCreditsForOrg(org));
      const used = await getAiUsage(org.id);
      assertAiCredits(used, allowance);

      // Replay this chat's prior text turns for context.
      const priors = await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.chatId, chat.id))
        .orderBy(asc(assistantMessages.createdAt));
      const history: PriorTurn[] = priors.map((m) => ({ role: m.role, content: m.content }));

      const result = await runAssistant(app, req, prompt, history);
      if (allowance !== -1 && result.calls > 0) await recordAiUse(org.id, result.calls);

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
        credits: { used: allowance === -1 ? used : used + result.calls, allowance },
      };
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
