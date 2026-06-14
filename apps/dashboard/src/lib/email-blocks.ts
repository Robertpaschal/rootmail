// The no-code email model: a template is an ordered list of blocks. The same
// renderer feeds the live preview and the HTML stored at save time, so what you
// build is exactly what sends. (A React Email renderer could slot in behind this
// same block interface later; a client renderer keeps the preview instant.)

export type Align = "left" | "center" | "right";
export type BlockType = "heading" | "text" | "button" | "image" | "divider" | "spacer";

interface BaseBlock {
  id: string;
  type: BlockType;
}
export interface HeadingBlock extends BaseBlock {
  type: "heading";
  text: string;
  level: 1 | 2 | 3;
  align: Align;
}
export interface TextBlock extends BaseBlock {
  type: "text";
  text: string;
  align: Align;
}
export interface ButtonBlock extends BaseBlock {
  type: "button";
  label: string;
  href: string;
  align: Align;
}
export interface ImageBlock extends BaseBlock {
  type: "image";
  src: string;
  alt: string;
  href: string;
}
export interface DividerBlock extends BaseBlock {
  type: "divider";
}
export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  size: number;
}
export type TemplateBlock =
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock;

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function newBlock(type: BlockType): TemplateBlock {
  const id = newId();
  switch (type) {
    case "heading":
      return { id, type, text: "Welcome, {{name}} 👋", level: 1, align: "left" };
    case "text":
      return {
        id,
        type,
        text: "Thanks for joining {{product}} — we're glad you're here.",
        align: "left",
      };
    case "button":
      return { id, type, label: "Get started", href: "{{action_url}}", align: "left" };
    case "image":
      return { id, type, src: "https://via.placeholder.com/600x200", alt: "", href: "" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: 24 };
  }
}

export function starterBlocks(): TemplateBlock[] {
  return [newBlock("heading"), newBlock("text"), newBlock("button")];
}

// --- Rendering --------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HEADING_SIZE: Record<number, number> = { 1: 28, 2: 22, 3: 18 };

function alignMargin(align: Align): string {
  if (align === "center") return "margin-left:auto;margin-right:auto;";
  if (align === "right") return "margin-left:auto;margin-right:0;";
  return "margin-left:0;margin-right:auto;";
}

function renderBlock(b: TemplateBlock): string {
  switch (b.type) {
    case "heading":
      return `<h${b.level} style="margin:0 0 16px;font-size:${HEADING_SIZE[b.level]}px;line-height:1.3;color:#111827;text-align:${b.align};font-weight:700;">${esc(b.text)}</h${b.level}>`;
    case "text":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;text-align:${b.align};">${esc(b.text).replace(/\n/g, "<br/>")}</p>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="${alignMargin(b.align)}margin-bottom:16px;"><tr><td style="border-radius:6px;background:#4f46e5;"><a href="${esc(b.href)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(b.label)}</a></td></tr></table>`;
    case "image": {
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:6px;margin:0 0 16px;"/>`;
      return b.href ? `<a href="${esc(b.href)}">${img}</a>` : img;
    }
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0 24px;"/>`;
    case "spacer":
      return `<div style="height:${b.size}px;line-height:${b.size}px;font-size:1px;">&nbsp;</div>`;
  }
}

export function blocksToHtml(blocks: TemplateBlock[]): string {
  const inner = blocks.length
    ? blocks.map(renderBlock).join("\n          ")
    : `<p style="color:#9ca3af;text-align:center;">Add blocks to build your email.</p>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:32px;">
          ${inner}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
