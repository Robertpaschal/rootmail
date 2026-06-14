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

// --- URL / color safety -----------------------------------------------------
// The serializer is an allowlist by construction (it only ever emits the tags
// below — never <script>/<iframe>/on*), so the one remaining injection surface
// is attacker-controlled URLs and colors. These guards close it.

/** Allow only safe link schemes; pass Handlebars vars + relative/anchor links. */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== "string") return "#";
  const url = raw.trim();
  if (url === "") return "#";
  if (url.startsWith("{{")) return url; // {{action_url}} etc. — filled at send time
  if (url.startsWith("/") || url.startsWith("#")) return url;
  const lower = url.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return url;
  }
  return "#"; // blocks javascript:, data:, vbscript:, etc.
}

/** Like safeUrl, but also permits small inline data:image URIs (pasted images). */
export function safeImageSrc(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const url = raw.trim();
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url) && url.length < 2_000_000) {
    return url;
  }
  const safe = safeUrl(url);
  return safe === "#" ? "" : safe;
}

/** Allow only hex / rgb() / simple named colors in inline styles. */
export function safeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(c)) return c;
  if (/^[a-z]{3,20}$/i.test(c)) return c;
  return null;
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
      case "textStyle": {
        const c = safeColor(m.attrs?.color);
        if (c) color += `color:${c};`;
        break;
      }
    }
  }
  if (color) out = `<span style="${color}">${out}</span>`;
  if (href) out = `<a href="${esc(safeUrl(href))}" style="color:${BRAND};">${out}</a>`;
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
    case "image": {
      const src = safeImageSrc(n.attrs?.src);
      if (!src) return "";
      return `<img src="${esc(src)}" alt="${esc(String(n.attrs?.alt ?? ""))}" style="display:block;max-width:100%;height:auto;border:0;border-radius:6px;margin:0 0 16px;"/>`;
    }
    case "button": {
      const label = esc(String(n.attrs?.label ?? "Button"));
      const href = esc(safeUrl(n.attrs?.href));
      const bg = safeColor(n.attrs?.bg) ?? BRAND;
      const fg = isLight(bg) ? "#111827" : "#ffffff";
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-radius:6px;background:${bg};"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${fg};text-decoration:none;">${label}</a></td></tr></table>`;
    }
    case "header":
      return renderHeader(n);
    case "footer":
      return renderFooter(n);
    case "embed":
      return renderEmbed(n);
    default:
      return n.content ? n.content.map(renderBlock).join("") : "";
  }
}

// --- Email chrome: header (logo/brand), footer (social/unsubscribe), embed ---

type SocialLink = { platform?: string; url?: string };
type FooterLink = { label?: string; url?: string };

const SOCIAL_LABELS: Record<string, string> = {
  x: "X",
  twitter: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  github: "GitHub",
  tiktok: "TikTok",
  website: "Website",
};

function renderHeader(n: DocNode): string {
  const a = n.attrs ?? {};
  const logo = safeImageSrc(a.logo);
  const align = a.align === "left" ? "left" : "center";
  const bg = safeColor(a.bg);
  const fg = bg && isLight(bg) ? "#111827" : bg ? "#ffffff" : "#111827";
  const inner = logo
    ? `<img src="${esc(logo)}" alt="${esc(String(a.alt ?? "Logo"))}" style="display:inline-block;max-height:44px;height:auto;border:0;"/>`
    : `<span style="font-size:20px;font-weight:700;color:${fg};">${esc(String(a.brandName ?? ""))}</span>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${bg ? `background:${bg};` : ""}margin:0 0 24px;border-radius:6px;"><tr><td align="${align}" style="padding:${bg ? "16px" : "4px 0 16px"};">${inner}</td></tr></table>`;
}

function renderFooter(n: DocNode): string {
  const a = n.attrs ?? {};
  const parts: string[] = [];

  const socials = Array.isArray(a.social) ? (a.social as SocialLink[]) : [];
  const socialHtml = socials
    .map((s) => {
      const href = safeUrl(s?.url);
      if (href === "#") return "";
      const label = SOCIAL_LABELS[String(s?.platform ?? "").toLowerCase()] ?? esc(String(s?.platform ?? "Link"));
      return `<a href="${esc(href)}" style="color:#6b7280;text-decoration:none;margin:0 6px;">${label}</a>`;
    })
    .filter(Boolean)
    .join("");
  if (socialHtml) parts.push(`<div style="margin:0 0 10px;">${socialHtml}</div>`);

  if (a.text) parts.push(`<div style="margin:0 0 6px;">${esc(String(a.text))}</div>`);
  if (a.address) parts.push(`<div style="margin:0 0 6px;">${esc(String(a.address))}</div>`);

  const links = Array.isArray(a.links) ? (a.links as FooterLink[]) : [];
  const footerLinks = links
    .map((l) => {
      const href = safeUrl(l?.url);
      if (href === "#") return "";
      return `<a href="${esc(href)}" style="color:#6b7280;margin:0 6px;">${esc(String(l?.label ?? "Link"))}</a>`;
    })
    .filter(Boolean);
  // {{unsubscribe_url}} is filled per-recipient at send time (signed token).
  if (a.showUnsubscribe !== false) {
    footerLinks.push(`<a href="{{unsubscribe_url}}" style="color:#6b7280;margin:0 6px;">Unsubscribe</a>`);
  }
  if (footerLinks.length) parts.push(`<div style="margin:6px 0 0;">${footerLinks.join(" · ")}</div>`);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid #e5e7eb;"><tr><td align="center" style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:#9ca3af;">${parts.join("")}</td></tr></table>`;
}

function renderEmbed(n: DocNode): string {
  const a = n.attrs ?? {};
  const href = safeUrl(a.url);
  if (href === "#") return "";
  const thumb = safeImageSrc(a.thumbnail);
  const title = esc(String(a.title ?? "Watch the video"));
  // Email clients strip <iframe>, so an embed renders as a clickable poster
  // image that links out — the correct, deliverable pattern.
  const poster = thumb
    ? `<img src="${esc(thumb)}" alt="${title}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;"/>`
    : `<div style="background:#111827;border-radius:8px;padding:48px 0;text-align:center;color:#ffffff;font-size:14px;">▶ ${title}</div>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td>` +
    `<a href="${esc(href)}" style="display:block;text-decoration:none;">${poster}` +
    `<span style="display:block;margin:8px 0 0;color:${BRAND};font-size:13px;font-weight:600;">▶ ${title}</span>` +
    `</a></td></tr></table>`
  );
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
    if (n.type === "embed") parts.push(String(n.attrs?.title ?? "Video"), String(n.attrs?.url ?? ""), "\n");
    if (n.type === "footer" && n.attrs?.address) parts.push("\n", String(n.attrs.address));
    (n.content ?? []).forEach(walk);
    if (["paragraph", "heading", "listItem"].includes(n.type)) parts.push("\n");
  };
  (doc?.content ?? []).forEach(walk);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
