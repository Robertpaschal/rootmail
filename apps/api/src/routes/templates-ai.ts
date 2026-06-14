import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AI_CREDITS, env, Errors } from "@rootmail/core";
import { getAiUsage, recordAiUse } from "../lib/billing";
import { generateTemplateDraft } from "../lib/ai";
import { loadOrg } from "../lib/features";
import { parse } from "../lib/validate";

const draftBody = z.object({ prompt: z.string().min(1).max(2000) });

export async function templateAiRoutes(app: FastifyInstance): Promise<void> {
  // Draft a template from a prompt. Metered against the plan's monthly AI
  // credits; a tighter per-route rate limit also caps burst abuse (inference
  // is expensive). Returns editor doc blocks (safe by construction).
  app.post(
    "/v1/templates/ai-draft",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const { prompt } = parse(draftBody, req.body);
      const org = await loadOrg(req);

      const allowance = AI_CREDITS[org.plan];
      const used = await getAiUsage(org.id);
      if (allowance !== -1 && used >= allowance) {
        throw Errors.quotaExceeded(
          `You've used all ${allowance} AI drafts this month. Upgrade your plan for more AI credits.`,
          {
            feature: "ai_credits",
            used,
            allowance,
            upgrade_url: `${env.DASHBOARD_URL.replace(/\/$/, "")}/billing`,
          },
        );
      }

      const draft = await generateTemplateDraft(prompt);
      if (allowance !== -1) await recordAiUse(org.id);

      return {
        object: "ai_draft",
        subject: draft.subject,
        blocks: draft.blocks,
        source: draft.source,
        credits: { used: allowance === -1 ? used : used + 1, allowance },
      };
    },
  );
}
