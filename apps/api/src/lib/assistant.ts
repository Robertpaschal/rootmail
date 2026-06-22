import Anthropic from "@anthropic-ai/sdk";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "@rootmail/core";

// The in-app AI assistant — the *operating layer* for the user's email. It runs
// a Claude tool-use loop where every tool is a call to rootmail's own API via
// app.inject() carrying the CALLER'S auth header. So each action runs the full
// route stack — requireFeature, requirePermission, the send quota, AI credits —
// and a blocked action comes back as the route's own error (402 feature_locked /
// 403 / quota), which the model relays to the user with the upgrade/add-on path.
// No separate limit logic.
//
// The tools span four jobs: DISCOVER/READ (find ids, read billing, list recent
// sends), BUILD (templates, lists, sequences, campaigns), OPERATE (add contacts,
// send or schedule campaigns and one-offs), and DIAGNOSE (inspect a message's
// status, its delivery audit trail, and suppression — to answer "why did this
// bounce?" and what to do about it).

interface ToolDef {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_schema: any;
  method: "GET" | "POST";
  path: (input: Record<string, unknown>) => string;
}

/** Build a `?a=1&b=2` query string, omitting null/undefined/empty values. */
function qs(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

const TOOLS: ToolDef[] = [
  // ---- Discover / read --------------------------------------------------
  {
    name: "get_billing",
    description: "Get the org's plan, usage, limits, seats and add-ons. Use this to advise on what the plan allows.",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/billing",
  },
  {
    name: "list_templates",
    description:
      "List the workspace's email templates (returns id, slug, name). Use to find a template_id before building a campaign or sending.",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/templates",
  },
  {
    name: "list_lists",
    description: "List the workspace's contact lists (id, name, contact count). Use to find a list_id.",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/lists",
  },
  {
    name: "list_sequences",
    description: "List the workspace's drip sequences (id, name, steps).",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/sequences",
  },
  {
    name: "list_campaigns",
    description: "List the workspace's campaigns (id, name, status, list_id, template_id, scheduled_at).",
    input_schema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/v1/campaigns",
  },
  {
    name: "list_messages",
    description:
      "List recent sent messages, newest first. Filter by status to triage deliverability: 'bounced' (hard/soft bounce), 'complained' (spam report), 'failed' (send error), 'delivered', 'sent', 'queued'. Returns each message's id, to, subject, status and error.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "queued | sending | sent | delivered | bounced | complained | failed" },
        limit: { type: "number", description: "1–100, default 20" },
      },
    },
    method: "GET",
    path: (i) => `/v1/messages${qs({ status: i.status, limit: i.limit })}`,
  },
  // ---- Diagnose ---------------------------------------------------------
  {
    name: "get_message",
    description:
      "Get one message by id: its status and the `error` field (the bounce/complaint/failure reason). Use to explain why a specific send did not land.",
    input_schema: { type: "object", properties: { message_id: { type: "string" } }, required: ["message_id"] },
    method: "GET",
    path: (i) => `/v1/messages/${i.message_id}`,
  },
  {
    name: "get_message_audit",
    description:
      "Get the full delivery audit trail for a message (queued → rendered → sent → delivered/bounced/complained, with timestamps and provider detail). Use for a deeper diagnosis than get_message alone.",
    input_schema: { type: "object", properties: { message_id: { type: "string" } }, required: ["message_id"] },
    method: "GET",
    path: (i) => `/v1/messages/${i.message_id}/audit`,
  },
  {
    name: "check_suppression",
    description:
      "Check whether an email address is on the workspace suppression list (so future sends to it are blocked). A recipient suppressed after a hard bounce or complaint is the usual reason a later email to them never arrives.",
    input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    method: "GET",
    path: (i) => `/v1/suppressions/check${qs({ email: i.email })}`,
  },
  {
    name: "get_deliverability",
    description:
      "Get the workspace's deliverability score (0–100, with a grade and status) plus delivery/bounce/complaint/failure rates over a window, the factors hurting it, and recommendations. Optional sub_tenant_id scopes to one sending domain; window_days defaults to 30. Use for 'how's my deliverability / sender reputation?'.",
    input_schema: {
      type: "object",
      properties: { window_days: { type: "number" }, sub_tenant_id: { type: "string" } },
    },
    method: "GET",
    path: (i) => `/v1/deliverability${qs({ window_days: i.window_days, sub_tenant_id: i.sub_tenant_id })}`,
  },
  // ---- Build ------------------------------------------------------------
  {
    name: "create_template",
    description:
      "Create an email template. html may use {{variables}} and should include an {{unsubscribe_url}} for bulk mail.",
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
    description:
      "Create a campaign that sends a template to a list. Needs list_id and template_id (use list_lists / list_templates to find them).",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, list_id: { type: "string" }, template_id: { type: "string" } },
      required: ["name", "list_id", "template_id"],
    },
    method: "POST",
    path: () => "/v1/campaigns",
  },
  // ---- Operate ----------------------------------------------------------
  {
    name: "add_contact",
    description: "Create or update a contact (by email). Optionally set name and tags. Tags can trigger contact_tagged sequences.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["email"],
    },
    method: "POST",
    path: () => "/v1/contacts",
  },
  {
    name: "add_contact_to_list",
    description:
      "Add a contact to a list by email (creates the contact if new). Use to populate a list before sending a campaign to it.",
    input_schema: {
      type: "object",
      properties: { list_id: { type: "string" }, email: { type: "string" } },
      required: ["list_id", "email"],
    },
    method: "POST",
    path: (i) => `/v1/lists/${i.list_id}/contacts`,
  },
  {
    name: "send_campaign",
    description:
      "Send a campaign now, or schedule it. Omit scheduled_at to send immediately; pass an ISO-8601 scheduled_at (in the future) to schedule. The campaign must already have a list and a template. Live sends require a verified account owner.",
    input_schema: {
      type: "object",
      properties: { campaign_id: { type: "string" }, scheduled_at: { type: "string", description: "ISO-8601, future" } },
      required: ["campaign_id"],
    },
    method: "POST",
    path: (i) => `/v1/campaigns/${i.campaign_id}/send`,
  },
  {
    name: "send_test_message",
    description:
      "Send a single email now, or schedule it. Provide to + subject + html, or to + template slug. Pass an ISO-8601 send_at (in the future) to schedule instead of sending immediately.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        html: { type: "string" },
        template: { type: "string" },
        send_at: { type: "string", description: "ISO-8601, future — schedule instead of sending now" },
      },
      required: ["to"],
    },
    method: "POST",
    path: () => "/v1/messages",
  },
];

const SYSTEM = `You are rootmail's in-app assistant — the operating layer for the user's email. You can:
- BUILD: templates, contact lists, drip sequences, and campaigns.
- OPERATE: add contacts to lists, and send or schedule campaigns and one-off messages.
- DIAGNOSE: inspect a message's status and error, read its delivery audit trail, check suppression, and
  pull the deliverability score (delivery/bounce/complaint rates + reputation factors) to explain why a
  send bounced/failed — or how the whole account's sender reputation is doing — and exactly how to fix it.

Tools execute against the user's own account with their plan and role, so a tool may return an error such
as 402 "feature_locked" (the capability isn't in their plan), "quota_exceeded" (out of AI credits / send
quota), or 403 (their role lacks permission). When a tool returns such an error, do NOT retry blindly —
clearly tell the user what's blocked and how to resolve it: name the required plan and its price if the
error provides them, and tell them they can upgrade or buy the add-on under "Plan & usage".

Discover ids with the list_* tools before acting; never invent ids. Confirm actions with the ids returned.
When diagnosing deliverability, gather evidence first (list_messages filtered by status, then get_message /
get_message_audit, and check_suppression for the recipient), then explain the cause in plain language and
the concrete next step — e.g. "this address hard-bounced and is now suppressed; correct the address or
remove the suppression." Be concise.`;

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

// A multi-step run (discover → build → operate, or triage → diagnose) can take a
// handful of tool rounds; cap the loop so a single request can never cost more
// than this many AI credits.
const MAX_STEPS = 8;

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
    for (let step = 0; step < MAX_STEPS; step++) {
      const resp = await client.messages.create({
        model: env.AI_MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools,
        messages,
      });
      calls++; // bill only calls that actually completed — a call that throws
      // (e.g. a 4xx before any tokens) consumed nothing and isn't charged.

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
    // Fall back to the keyless path. `calls` counts only completed model calls,
    // so a failure before any completed (e.g. out-of-credits 400) bills nothing.
    return { ...(await mockAssistant(app, req, prompt)), calls };
  }
}

// Keyless fallback: a tiny intent matcher that still executes through the gated
// API, so the upgrade-surfacing and diagnose behaviour is demoable without a model.
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

  // Diagnose: "how's my deliverability / sender reputation?"
  if (p.includes("deliverab") || p.includes("reputation") || p.includes("sender score")) {
    const out = await runTool(app, req, tool("get_deliverability"), {});
    actions.push({ tool: "get_deliverability", status: out.status });
    if (out.status >= 400) return { reply: describeOutcome("checked deliverability", out), actions, source: "mock" };
    const b = out.body as {
      score: number | null;
      status: string;
      rates: { delivery: number; bounce: number; complaint: number };
      recommendations: string[];
    } | null;
    if (!b || b.score === null) {
      return { reply: "No delivery data yet — send some email and I can score your sender reputation.", actions, source: "mock" };
    }
    const tip = b.recommendations[0] ? ` Top tip: ${b.recommendations[0]}` : "";
    return {
      reply: `Deliverability: ${b.score}/100 (${b.status}). Delivery ${b.rates.delivery}%, bounce ${b.rates.bounce}%, complaint ${b.rates.complaint}%.${tip} (Set ANTHROPIC_API_KEY for a full analysis.)`,
      actions,
      source: "mock",
    };
  }

  // Diagnose: "why did this bounce / fail / not deliver?"
  if (p.includes("bounce") || p.includes("deliver") || p.includes("fail") || p.includes("why")) {
    const status =
      p.includes("complain") || p.includes("spam")
        ? "complained"
        : p.includes("bounce")
          ? "bounced"
          : p.includes("fail")
            ? "failed"
            : "bounced";
    const out = await runTool(app, req, tool("list_messages"), { status, limit: 10 });
    actions.push({ tool: "list_messages", status: out.status });
    if (out.status >= 400) return { reply: describeOutcome("checked recent messages", out), actions, source: "mock" };
    const data = (out.body as { data?: Array<{ to?: string; error?: string | null }> } | null)?.data ?? [];
    if (data.length === 0) {
      return { reply: `No recent ${status} messages — deliverability looks clean.`, actions, source: "mock" };
    }
    const lines = data
      .slice(0, 5)
      .map((m) => `• ${m.to ?? "?"} — ${m.error || status}`)
      .join("\n");
    return {
      reply: `${data.length} recent ${status} message(s):\n${lines}\n\nA suppressed recipient (after a hard bounce/complaint) is the usual cause a later email never lands — fix the address or remove the suppression. (Set ANTHROPIC_API_KEY for a full diagnosis.)`,
      actions,
      source: "mock",
    };
  }
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
          : "To send a campaign I need a list and a template — create a list, add contacts, then ask me to build and send the campaign. (Set ANTHROPIC_API_KEY for full multi-step help.)",
      actions,
      source: "mock",
    };
  }
  return {
    reply:
      "I can build sequences, lists, campaigns and templates, populate lists, send or schedule campaigns, and diagnose why a message bounced — and I'll tell you if something needs a plan upgrade. Set ANTHROPIC_API_KEY to enable full AI assistance.",
    actions,
    source: "mock",
  };
}
