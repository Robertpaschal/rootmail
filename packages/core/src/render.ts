import Handlebars from "handlebars";

export interface RenderInput {
  subject: string;
  html: string;
  text?: string | null;
  variables?: Record<string, unknown>;
}

export interface RenderOutput {
  subject: string;
  html: string;
  text: string;
}

type Compiled = ReturnType<typeof Handlebars.compile>;
const cache = new Map<string, Compiled>();

function compile(source: string): Compiled {
  let tpl = cache.get(source);
  if (!tpl) {
    tpl = Handlebars.compile(source, { noEscape: false });
    cache.set(source, tpl);
  }
  return tpl;
}

/**
 * Per-recipient personalization derived from a saved contact: `email`, `name`,
 * `first_name`/`last_name` (split from name), `phone`, plus every custom field
 * the contact carries in `metadata` — so a template's {{placeholders}} fill
 * themselves for each recipient, on every send path (transactional, campaigns,
 * sequences). Spread caller-supplied variables AFTER this so explicit values
 * always win; metadata wins over the derived built-ins (it's the user's data).
 */
export function contactVariables(
  contact:
    | { email?: string | null; name?: string | null; phone?: string | null; metadata?: Record<string, unknown> | null }
    | null
    | undefined,
  fallbackEmail?: string,
): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  const email = contact?.email ?? fallbackEmail;
  if (email) vars.email = email;
  const name = contact?.name?.trim();
  if (name) {
    vars.name = name;
    const [first, ...rest] = name.split(/\s+/);
    vars.first_name = first;
    if (rest.length > 0) vars.last_name = rest.join(" ");
  }
  if (contact?.phone) vars.phone = contact.phone;
  for (const [k, v] of Object.entries(contact?.metadata ?? {})) {
    if (v != null) vars[k] = v;
  }
  return vars;
}

/** Render subject + html with Handlebars; derive plain text when not provided. */
export function render(input: RenderInput): RenderOutput {
  const variables = input.variables ?? {};
  const subject = compile(input.subject)(variables);
  const html = compile(input.html)(variables);
  const text = input.text ? compile(input.text)(variables) : htmlToText(html);
  return { subject, html, text };
}

/** Pragmatic HTML → text fallback (good enough for previews and a text/plain part). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
