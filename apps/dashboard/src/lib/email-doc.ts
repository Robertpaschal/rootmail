// Serialize a TipTap / ProseMirror JSON document into email-safe HTML. The doc
// is the source of truth for the writing editor; this renderer feeds both the
// live preview and the html stored at send time, so the two never diverge.

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export const BRAND = "#4f46e5";

export function isDoc(value: unknown): value is DocNode {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as DocNode).type === "doc" &&
    Array.isArray((value as DocNode).content)
  );
}

export function emptyDoc(): DocNode {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Welcome, {{name}} 👋" }] },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thanks for joining {{product}} — we're glad you're here." }],
      },
    ],
  };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}

function renderText(n: DocNode): string {
  if (n.type === "hardBreak") return "<br/>";
  if (n.type !== "text") return "";
  let out = esc(n.text ?? "");
  let color = "";
  let href: string | null = null;
  for (const m of n.marks ?? []) {
    switch (m.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code style="background:#f3f4f6;border-radius:3px;padding:1px 4px;font-size:13px;">${out}</code>`;
        break;
      case "link":
        href = typeof m.attrs?.href === "string" ? m.attrs.href : null;
        break;
      case "textStyle":
        if (typeof m.attrs?.color === "string") color += `color:${m.attrs.color};`;
        break;
    }
  }
  if (color) out = `<span style="${color}">${out}</span>`;
  if (href) out = `<a href="${esc(href)}" style="color:${BRAND};">${out}</a>`;
  return out;
}

function inline(nodes: DocNode[] | undefined): string {
  return (nodes ?? []).map(renderText).join("");
}

function alignStyle(attrs: Record<string, unknown> | undefined): string {
  const a = attrs?.textAlign;
  return a === "center" || a === "right" ? `text-align:${a};` : "";
}

function renderBlock(n: DocNode): string {
  switch (n.type) {
    case "paragraph": {
      const inner = inline(n.content);
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;${alignStyle(n.attrs)}">${inner || "&nbsp;"}</p>`;
    }
    case "heading": {
      const level = Number(n.attrs?.level ?? 1);
      const size = level === 1 ? 28 : level === 2 ? 22 : 18;
      return `<h${level} style="margin:0 0 12px;font-size:${size}px;line-height:1.3;font-weight:700;color:#111827;${alignStyle(n.attrs)}">${inline(n.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul style="margin:0 0 16px;padding-left:22px;color:#374151;font-size:15px;line-height:1.6;">${(n.content ?? []).map(renderBlock).join("")}</ul>`;
    case "orderedList":
      return `<ol style="margin:0 0 16px;padding-left:22px;color:#374151;font-size:15px;line-height:1.6;">${(n.content ?? []).map(renderBlock).join("")}</ol>`;
    case "listItem":
      return `<li style="margin:0 0 6px;">${(n.content ?? [])
        .map((c) => (c.type === "paragraph" ? inline(c.content) : renderBlock(c)))
        .join("")}</li>`;
    case "blockquote":
      return `<blockquote style="margin:0 0 16px;padding:4px 16px;border-left:3px solid #e5e7eb;color:#6b7280;font-style:italic;">${(n.content ?? []).map(renderBlock).join("")}</blockquote>`;
    case "horizontalRule":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0 24px;"/>`;
    case "image":
      return `<img src="${esc(String(n.attrs?.src ?? ""))}" alt="${esc(String(n.attrs?.alt ?? ""))}" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px;margin:0 0 16px;"/>`;
    case "button": {
      const label = esc(String(n.attrs?.label ?? "Button"));
      const href = esc(String(n.attrs?.href ?? ""));
      const bg = String(n.attrs?.bg ?? BRAND);
      const fg = isLight(bg) ? "#111827" : "#ffffff";
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:6px;background:${esc(bg)};"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${fg};text-decoration:none;">${label}</a></td></tr></table>`;
    }
    default:
      return n.content ? n.content.map(renderBlock).join("") : "";
  }
}

export function docToHtml(doc: DocNode | null | undefined): string {
  const body =
    doc?.content && doc.content.length
      ? doc.content.map(renderBlock).join("\n          ")
      : `<p style="color:#9ca3af;">Start writing…</p>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:32px;">
          ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Flatten the doc's text — used for variable detection and a plain-text body. */
export function docToText(doc: DocNode | null | undefined): string {
  const parts: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === "text") parts.push(n.text ?? "");
    if (n.type === "button") parts.push(String(n.attrs?.label ?? ""), String(n.attrs?.href ?? ""));
    (n.content ?? []).forEach(walk);
    if (["paragraph", "heading", "listItem"].includes(n.type)) parts.push("\n");
  };
  (doc?.content ?? []).forEach(walk);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
