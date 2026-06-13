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
