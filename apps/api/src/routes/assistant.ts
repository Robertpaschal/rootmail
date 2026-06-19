import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ADD_ONS, AI_CREDITS, env, Errors } from "@rootmail/core";
import { runAssistant } from "../lib/assistant";
import { getAiUsage, recordAiUse } from "../lib/billing";
import { loadOrg } from "../lib/features";
import { requirePermission } from "../lib/permissions";
import { addonQuantity } from "../lib/seats";
import { parse } from "../lib/validate";

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

      const base = AI_CREDITS[org.plan];
      const packs = await addonQuantity(org.id, "ai_credit_pack");
      const allowance = base === -1 ? -1 : base + packs * ADD_ONS.ai_credit_pack.grant;
      const used = await getAiUsage(org.id);
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

      // Charge 1 credit per model call the assistant actually made (1 for a quick
      // reply, up to 6 for a multi-step run) — credits track real, token-bounded
      // model calls, so heavier requests cost proportionally more. A keyless mock
      // run makes none and is free.
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
}
