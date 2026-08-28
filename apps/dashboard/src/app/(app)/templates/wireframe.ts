/**
 * A TEMPLATE'S REAL SHAPE, read off its real HTML.
 *
 * The templates page was a five-column table — name, slug, type, version,
 * updated — which is a filing cabinet for a shelf of things whose entire
 * purpose is that they look like something. You do not recognise a template by
 * its slug; you recognise it by its shape.
 *
 * So the gallery draws a wireframe, and the wireframe is DERIVED, never
 * invented. Every band below corresponds to a tag really present in the stored
 * html, in the order it appears there. A template with three paragraphs and no
 * button draws three paragraphs and no button. That matters: a decorative
 * "email-ish" sketch on every card would be the same lie as a green line
 * through an event we did not witness — a picture asserting content we did not
 * read.
 *
 * A plain module (not `"use client"`) because a server component calls it, and
 * a server component may not import a helper from a client module — tsc allows
 * it and production crashes (CLAUDE.md).
 */

export type Band =
  | { kind: "heading"; weight: 1 | 2 | 3 }
  | { kind: "text"; lines: number }
  | { kind: "image" }
  | { kind: "button" }
  | { kind: "rule" };

const TAG = /<(h1|h2|h3|p|img|hr|div|a|td)\b([^>]*)>/gi;

/** Rough character count of the text inside a block, for how many lines to draw. */
function textLines(html: string, from: number): number {
  const chunk = html.slice(from, from + 600);
  const end = chunk.search(/<\/(p|h1|h2|h3|td)>/i);
  const inner = (end === -1 ? chunk : chunk.slice(0, end)).replace(/<[^>]*>/g, "").trim();
  if (!inner) return 0;
  return Math.min(4, Math.max(1, Math.round(inner.length / 55)));
}

/**
 * At most `limit` bands: a thumbnail is a silhouette, and a 40-band tower would
 * be neither legible nor a thumbnail. Truncation is honest — the card says how
 * many blocks the template really has beside the drawing.
 */
export function wireframe(html: string | null | undefined, limit = 7): { bands: Band[]; blocks: number } {
  if (!html) return { bands: [], blocks: 0 };
  const bands: Band[] = [];
  let blocks = 0;
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    let band: Band | null = null;
    if (tag === "h1") band = { kind: "heading", weight: 1 };
    else if (tag === "h2") band = { kind: "heading", weight: 2 };
    else if (tag === "h3") band = { kind: "heading", weight: 3 };
    else if (tag === "img") band = { kind: "image" };
    else if (tag === "hr") band = { kind: "rule" };
    else if (tag === "a" && /data-rm-button|button|border-radius/i.test(attrs)) band = { kind: "button" };
    else if (tag === "div" && /data-rm-button/i.test(attrs)) band = { kind: "button" };
    else if (tag === "p" || tag === "td") {
      const lines = textLines(html, m.index + m[0].length);
      band = lines > 0 ? { kind: "text", lines } : null;
    }
    if (!band) continue;
    // A <td> wrapping a <p> would otherwise draw the same paragraph twice.
    const prev = bands[bands.length - 1];
    if (prev && prev.kind === "text" && band.kind === "text" && prev.lines === band.lines) continue;
    blocks += 1;
    if (bands.length < limit) bands.push(band);
  }
  return { bands, blocks };
}
