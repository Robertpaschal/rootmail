import Anthropic from "@anthropic-ai/sdk";
import { env } from "@rootmail/core";

// AI returns editor *doc blocks* (not raw HTML), so the output always flows
// through the dashboard's allowlist serializer (safeUrl/safeColor) — untrusted
// model output can never inject script/markup. We additionally normalize to a
// known node subset here so a malformed response can't break the editor.

export interface AiDocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AiDocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface AiDraft {
  subject: string;
  blocks: AiDocNode;
  source: "claude" | "mock";
}

const BLOCK_TYPES = new Set([
  "heading",
  "paragraph",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "button",
  "horizontalRule",
  "footer",
]);
const MARK_TYPES = new Set(["bold", "italic", "link", "code", "strike", "underline"]);

function normalizeNode(input: unknown): AiDocNode | null {
  if (!input || typeof input !== "object") return null;
  const n = input as Record<string, unknown>;
  const type = typeof n.type === "string" ? n.type : null;
  if (!type) return null;

  if (type === "text") {
    const text = typeof n.text === "string" ? n.text : "";
    if (!text) return null;
    const marks = Array.isArray(n.marks)
      ? (n.marks as unknown[])
          .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
          .filter((m) => MARK_TYPES.has(String(m.type)))
          .map((m) => ({ type: String(m.type), attrs: m.attrs as Record<string, unknown> | undefined }))
      : [];
    return marks.length ? { type: "text", text, marks } : { type: "text", text };
  }

  if (!BLOCK_TYPES.has(type)) return null;
  const node: AiDocNode = { type };
  if (n.attrs && typeof n.attrs === "object") node.attrs = n.attrs as Record<string, unknown>;
  if (Array.isArray(n.content)) {
    const content = (n.content as unknown[])
      .map(normalizeNode)
      .filter((x): x is AiDocNode => x !== null);
    if (content.length) node.content = content;
  }
  return node;
}

function normalizeDoc(raw: unknown): AiDocNode {
  const r = (raw ?? {}) as Record<string, unknown>;
  const content = Array.isArray(r.content)
    ? (r.content as unknown[]).map(normalizeNode).filter((x): x is AiDocNode => x !== null)
    : [];
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

const SYSTEM_PROMPT = `You are an email copywriter for a transactional/marketing email tool.
Given a request, write a concise, friendly marketing email as a JSON document.
Respond with ONLY a JSON object (no prose, no code fences) of the exact shape:
{"subject": string, "blocks": {"type":"doc","content":[ ...nodes ]}}
Allowed node types: heading (attrs.level 1-3), paragraph, bulletList/orderedList with listItem children,
blockquote, button (attrs.label, attrs.href — use "{{action_url}}" for the CTA), horizontalRule, footer
(attrs.text, attrs.showUnsubscribe:true). Text nodes: {"type":"text","text":...} with optional marks
bold/italic/link (link attrs.href). Use {{name}}/{{product}} merge variables where natural. Keep it short.`;

/** Deterministic, no-network draft used when ANTHROPIC_API_KEY is unset. */
function mockDraft(prompt: string): AiDraft {
  const topic = prompt.trim().replace(/\s+/g, " ").slice(0, 60) || "your update";
  const title = topic.charAt(0).toUpperCase() + topic.slice(1);
  return {
    subject: `${title} — {{product}}`,
    source: "mock",
    blocks: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: `Hi {{name}}, ${title.toLowerCase()}` }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: `Here's a draft based on your request: "${topic}". Edit this copy, then add your branding, images, and a footer.` },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Set ANTHROPIC_API_KEY to have Claude write this for real." }],
        },
        { type: "button", attrs: { label: "Get started", href: "{{action_url}}", bg: "#4f46e5" } },
        { type: "footer", attrs: { text: "You're receiving this from {{product}}.", showUnsubscribe: true } },
      ],
    },
  };
}

function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((fenced ? fenced[1] : text).trim());
}

let client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (client === undefined) {
    client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  }
  return client;
}

/** Draft an email template from a natural-language prompt. Falls back to the
 * deterministic mock when no key is set or Claude errors — never hard-fails. */
export async function generateTemplateDraft(prompt: string): Promise<AiDraft> {
  const anthropic = getClient();
  if (!anthropic) return mockDraft(prompt);

  try {
    const msg = await anthropic.messages.create({
      model: env.AI_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseModelJson(text) as { subject?: unknown; blocks?: unknown };
    const subject = typeof parsed.subject === "string" && parsed.subject ? parsed.subject : "Your update from {{product}}";
    return { subject, blocks: normalizeDoc(parsed.blocks), source: "claude" };
  } catch (err) {
    console.warn(`[ai] draft failed, using mock: ${String(err)}`);
    return mockDraft(prompt);
  }
}
