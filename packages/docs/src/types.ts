// The docs content model — framework-agnostic data. Both the developers site
// and the in-app dashboard docs render this same tree with their own components,
// so the two can never drift. No React here on purpose.

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** A rich text run: plain string, or a marked span. `code` = inline mono,
 * `strong` = bold, `link` = anchor with href. Renderers map these to spans. */
export type Inline =
  | string
  | { code: string }
  | { strong: string }
  | { link: string; href: string };

export type DocBlock =
  /** A sub-heading within a page; `id` anchors the on-page table of contents. */
  | { kind: "heading"; text: string; id: string }
  /** A paragraph of rich text. */
  | { kind: "prose"; content: Inline[] }
  /** A fenced code sample with a language tag + filename/label. */
  | { kind: "code"; lang: string; label?: string; code: string }
  /** One API endpoint: method, path, one-line purpose. */
  | { kind: "endpoint"; method: HttpMethod; path: string; summary: string }
  /** A parameter / field table. */
  | { kind: "params"; title?: string; rows: ParamRow[] }
  /** A bulleted or numbered list of rich-text items. */
  | { kind: "list"; ordered?: boolean; items: Inline[][] }
  /** A callout box — note / warning / tip. */
  | { kind: "callout"; tone: "note" | "warn" | "tip"; content: Inline[] };

export interface ParamRow {
  name: string;
  type: string;
  required?: boolean;
  desc: Inline[];
}

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  blocks: DocBlock[];
}

export interface DocSection {
  /** Group label in the sidebar. */
  label: string;
  pages: DocPage[];
}

// --- Tiny authoring helpers so the content file reads cleanly ----------------
export const h = (text: string, id?: string): DocBlock => ({
  kind: "heading",
  text,
  id: id ?? slugify(text),
});
export const p = (...content: Inline[]): DocBlock => ({ kind: "prose", content });
export const code = (lang: string, code: string, label?: string): DocBlock => ({
  kind: "code",
  lang,
  code,
  label,
});
export const endpoint = (method: HttpMethod, path: string, summary: string): DocBlock => ({
  kind: "endpoint",
  method,
  path,
  summary,
});
export const params = (rows: ParamRow[], title?: string): DocBlock => ({ kind: "params", rows, title });
export const list = (items: Inline[][], ordered = false): DocBlock => ({ kind: "list", ordered, items });
export const callout = (tone: "note" | "warn" | "tip", ...content: Inline[]): DocBlock => ({
  kind: "callout",
  tone,
  content,
});
export const c = (code: string) => ({ code });
export const b = (strong: string) => ({ strong });
export const a = (link: string, href: string) => ({ link, href });

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
