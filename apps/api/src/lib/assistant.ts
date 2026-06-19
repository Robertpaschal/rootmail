import Anthropic from "@anthropic-ai/sdk";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "@rootmail/core";

// The in-app AI assistant. It runs a Claude tool-use loop where every tool is a
// call to rootmail's own API via app.inject() carrying the CALLER'S auth header.
// So each action runs the full route stack — requireFeature, requirePermission,
// the send quota, AI credits — and a blocked action comes back as the route's
// own error (402 feature_locked / 403 / quota), which the model relays to the
// user with the upgrade/add-on path. No separate limit logic.

interface ToolDef {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_schema: any;
  method: "GET" | "POST";
  path: (input: Record<string, unknown>) => string;
}

const TOOLS: ToolDef[] = [
  {
    name: "get_billing",
    description: "Get the org's plan, usage, limits, seats and add-ons. Use this to advise on what the plan allows.",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/billing",
  },
  {
    name: "list_templates",
    description: "List the workspace's email templates (returns id, slug, name).",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/templates",
  },
  {
    name: "create_template",
    description: "Create an email template.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, slug: { type: "string" }, subject: { type: "string" }, html: { type: "string" } },
      required: ["name", "slug", "subject", "html"],
    },
    method: "POST",
    path: () => "/v1/templates",
  },
  {
    name: "create_sequence",
    description:
      "Create a drip sequence. steps is an array of: {type:'wait',hours} | {type:'send',template:<slug>} | {type:'branch',event:'opened'|'clicked',within_hours,goto}. trigger is {type:'manual'|'contact_created'|'contact_tagged',tag?}.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, steps: { type: "array" }, trigger: { type: "object" } },
      required: ["name", "steps"],
    },
    method: "POST",
    path: () => "/v1/sequences",
  },
  {
    name: "create_list",
    description: "Create a contact list.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    method: "POST",
    path: () => "/v1/lists",
  },
  {
    name: "create_campaign",
    description: "Create a campaign that sends a template to a list. Needs list_id and template_id (use list/template tools to find them).",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, list_id: { type: "string" }, template_id: { type: "string" } },
      required: ["name", "list_id", "template_id"],
    },
    method: "POST",
    path: () => "/v1/campaigns",
  },
  {
    name: "send_test_message",
    description: "Send a single email now (a test/one-off). Provide to + subject + html, or to + template slug.",
    input_schema: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, html: { type: "string" }, template: { type: "string" } },
      required: ["to"],
    },
    method: "POST",
    path: () => "/v1/messages",
  },
];

const SYSTEM = `You are rootmail's in-app assistant. Help the user accomplish email tasks by calling the
provided tools. Tools execute against the user's own account with their plan and role, so a tool may
return an error such as 402 "feature_locked" (the capability isn't in their plan), "quota_exceeded"
(out of AI credits / send quota), or 403 (their role lacks permission). When a tool returns such an
error, do NOT retry blindly — clearly tell the user what's blocked and how to resolve it: name the
required plan and its price if the error provides them, and tell them they can upgrade or buy the add-on
under "Plan & usage". Be concise, confirm actions with the ids returned, and never invent ids — use the
list_* tools to discover them first.`;

interface ToolOutcome {
  status: number;
  body: unknown;
}

async function runTool(
  app: FastifyInstance,
  req: FastifyRequest,
  def: ToolDef,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const res = await app.inject({
    method: def.method,
    url: def.path(input),
    headers: {
      authorization: req.headers.authorization ?? "",
      ...(req.headers["x-rootmail-subtenant"]
        ? { "x-rootmail-subtenant": String(req.headers["x-rootmail-subtenant"]) }
        : {}),
      "content-type": "application/json",
    },
    payload: def.method === "POST" ? input : undefined,
  });
  let body: unknown = null;
  try {
    body = res.json();
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body };
}

export interface AssistantResult {
  reply: string;
  actions: Array<{ tool: string; status: number }>;
  source: "claude" | "mock";
  /** Billable AI credits = number of model calls made (1 per bounded call). */
  calls: number;
}

export async function runAssistant(
  app: FastifyInstance,
  req: FastifyRequest,
  prompt: string,
): Promise<AssistantResult> {
  if (!env.ANTHROPIC_API_KEY) return { ...(await mockAssistant(app, req, prompt)), calls: 0 };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const actions: Array<{ tool: string; status: number }> = [];
  let calls = 0;

  try {
    for (let step = 0; step < 6; step++) {
      calls++; // each model call is one billable, token-bounded AI credit
      const resp = await client.messages.create({
        model: env.AI_MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools,
        messages,
      });

      if (resp.stop_reason === "tool_use") {
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            const def = TOOLS.find((t) => t.name === block.name);
            const out = def
              ? await runTool(app, req, def, block.input as Record<string, unknown>)
              : { status: 404, body: "unknown tool" };
            actions.push({ tool: block.name, status: out.status });
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(out).slice(0, 4000),
              is_error: out.status >= 400,
            });
          }
        }
        messages.push({ role: "assistant", content: resp.content });
        messages.push({ role: "user", content: results });
        continue;
      }

      const reply = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { reply: reply || "Done.", actions, source: "claude", calls };
    }
    return {
      reply: "That needed too many steps — try a more specific request.",
      actions,
      source: "claude",
      calls,
    };
  } catch (err) {
    console.warn(`[assistant] claude failed, using mock: ${String(err)}`);
    // The failed attempt(s) still consumed tokens — bill those calls.
    return { ...(await mockAssistant(app, req, prompt)), calls };
  }
}

// Keyless fallback: a tiny intent matcher that still executes through the gated
// API, so the upgrade-surfacing behaviour is demoable without a model.
function describeOutcome(action: string, out: ToolOutcome): string {
  if (out.status < 400) return `Done — ${action}.`;
  const body = out.body as { error?: { message?: string; details?: Record<string, unknown> } } | null;
  const err = body?.error;
  if (out.status === 402 && err?.details) {
    const d = err.details;
    const plan = d.required_plan_name ? ` (${String(d.required_plan_name)}${d.price ? `, $${d.price}/mo` : ""})` : "";
    return `${err.message ?? "That needs an upgrade."}${plan} — upgrade under Plan & usage.`;
  }
  return err?.message ?? `That action was blocked (HTTP ${out.status}).`;
}

async function mockAssistant(
  app: FastifyInstance,
  req: FastifyRequest,
  prompt: string,
): Promise<Omit<AssistantResult, "calls">> {
  const p = prompt.toLowerCase();
  const tool = (name: string) => TOOLS.find((t) => t.name === name)!;
  const actions: Array<{ tool: string; status: number }> = [];

  if (p.includes("sequence") || p.includes("drip") || p.includes("automation")) {
    const out = await runTool(app, req, tool("create_sequence"), {
      name: "Welcome series (AI)",
      steps: [{ type: "send", template: "welcome" }, { type: "wait", hours: 48 }, { type: "send", template: "welcome" }],
    });
    actions.push({ tool: "create_sequence", status: out.status });
    return { reply: describeOutcome("created a 2-email welcome sequence", out), actions, source: "mock" };
  }
  if (p.includes("list")) {
    const out = await runTool(app, req, tool("create_list"), { name: "AI list" });
    actions.push({ tool: "create_list", status: out.status });
    return { reply: describeOutcome("created a list", out), actions, source: "mock" };
  }
  if (p.includes("campaign")) {
    const out = await runTool(app, req, tool("get_billing"), {});
    actions.push({ tool: "get_billing", status: out.status });
    return {
      reply:
        out.status >= 400
          ? describeOutcome("checked billing", out)
          : "To send a campaign I need a list and a template — create a list, add contacts, then ask me to build the campaign. (Set ANTHROPIC_API_KEY for full multi-step help.)",
      actions,
      source: "mock",
    };
  }
  return {
    reply:
      "I can help create sequences, lists, campaigns, and templates — and I'll tell you if something needs a plan upgrade. Set ANTHROPIC_API_KEY to enable full AI assistance.",
    actions,
    source: "mock",
  };
}
