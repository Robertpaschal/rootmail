"use client";

// The template design studio: a TipTap canvas of email-safe blocks, a left blocks
// palette (click to add), a design panel (whole-email theme), and a right inspector
// that edits the selected block with real fields — no window.prompt anywhere. The
// email HTML always comes from lib/email-doc.ts, so what you design is what sends.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Plus,
  Quote,
  Sparkles,
  Strikethrough,
  Trash2,
  Type,
  Video,
  Wand2,
  X,
} from "lucide-react";
import { aiDraftAction, uploadAssetAction } from "./actions";
import {
  BRAND,
  DEFAULT_THEME,
  FONT_STACKS,
  type DocNode,
  type EmailTheme,
  type FontKey,
  safeUrl,
} from "@/lib/email-doc";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// --- Nodes ------------------------------------------------------------------

const EmailButton = Node.create({
  name: "button",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: "Get started" },
      href: { default: "{{action_url}}" },
      bg: { default: BRAND },
      align: { default: "left" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-rm-button]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const align = node.attrs.align === "center" ? "center" : node.attrs.align === "right" ? "right" : "left";
    return [
      "div",
      { style: `text-align:${align};margin:2px 0;` },
      [
        "a",
        mergeAttributes(HTMLAttributes, {
          "data-rm-button": "",
          style: `display:inline-block;padding:10px 20px;border-radius:6px;background:${node.attrs.bg};color:#fff;font-weight:600;text-decoration:none;cursor:pointer;`,
        }),
        node.attrs.label,
      ],
    ];
  },
});

// Header/footer/embed are atomic "chrome" nodes — the real email HTML comes from
// lib/email-doc.ts; these renderHTML are just labelled placeholders in-editor.
function chromeNode(
  name: string,
  label: (attrs: Record<string, unknown>) => string,
  attrs: Record<string, { default: unknown }>,
) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    addAttributes() {
      return attrs;
    },
    parseHTML() {
      return [{ tag: `div[data-rm-${name}]` }];
    },
    renderHTML({ node }) {
      return [
        "div",
        {
          [`data-rm-${name}`]: "",
          style:
            "border:1px dashed #c7d2fe;border-radius:6px;padding:10px 12px;margin:4px 0;color:#4f46e5;font-size:13px;font-weight:600;background:#eef2ff;",
        },
        label(node.attrs),
      ];
    },
  });
}

const EmailHeader = chromeNode(
  "header",
  (a) => `▦ Header${a.logo ? " · logo" : a.brandName ? ` · ${String(a.brandName)}` : ""}`,
  { logo: { default: "" }, brandName: { default: "" }, bg: { default: "" }, align: { default: "center" } },
);
const EmailFooter = chromeNode(
  "footer",
  (a) => `▤ Footer${a.address ? " · address" : ""}${a.showUnsubscribe !== false ? " · unsubscribe" : ""}`,
  { text: { default: "" }, address: { default: "" }, social: { default: [] }, links: { default: [] }, showUnsubscribe: { default: true } },
);
const EmailEmbed = chromeNode("embed", (a) => `▶ ${String(a.title || "Video / embed")}`, {
  url: { default: "" },
  thumbnail: { default: "" },
  title: { default: "Watch the video" },
});

const EmailSpacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { size: { default: 24 } };
  },
  parseHTML() {
    return [{ tag: "div[data-rm-spacer]" }];
  },
  renderHTML({ node }) {
    const size = Number(node.attrs.size) || 24;
    return [
      "div",
      {
        "data-rm-spacer": "",
        style: `height:${size}px;border:1px dashed #d4d4d8;border-radius:4px;margin:4px 0;display:flex;align-items:center;justify-content:center;color:#a1a1aa;font-size:11px;`,
      },
      `↕ ${size}px space`,
    ];
  },
});

// Image gains align/width/link so a picture can be sized and centered like in any
// designer. The email HTML is produced by email-doc.ts; this keeps the canvas true.
const EmailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: "center" },
      width: { default: 100 },
      href: { default: "" },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const align = node.attrs.align === "left" ? "left" : node.attrs.align === "right" ? "right" : "center";
    const width = Number(node.attrs.width) || 100;
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        style: `display:block;width:${width}%;max-width:100%;height:auto;border-radius:6px;margin:${align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0"};`,
      }),
    ];
  },
});

// Paragraph/heading alignment without pulling in a whole extension — just declares
// the round-tripping `textAlign` attribute that email-doc.ts already honors.
const EmailTextAlign = Extension.create({
  name: "emailTextAlign",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.textAlign || null,
            renderHTML: (attrs) => (attrs.textAlign ? { style: `text-align:${attrs.textAlign}` } : {}),
          },
        },
      },
    ];
  },
});

// --- Upload / embed helpers -------------------------------------------------

/** Open a file picker, upload via the server action, return the public URL. */
async function pickAndUpload(accept = "image/*"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadAssetAction(fd);
      if (res.error) {
        window.alert(res.error);
        return resolve(null);
      }
      resolve(res.url ?? null);
    };
    input.click();
  });
}

/** Resolve a pasted video/social URL to a poster (YouTube gets a real thumbnail). */
export function deriveEmbed(raw: string): { url: string; thumbnail: string; title: string } | null {
  const url = safeUrl(raw);
  if (url === "#") return null;
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return { url, thumbnail: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`, title: "Watch on YouTube" };
  return { url, thumbnail: "", title: "Open link" };
}

// --- Top-level block operations (reorder / duplicate / delete / insert) ------

interface BlockRange {
  index: number;
  from: number;
  to: number;
  node: import("@tiptap/pm/model").Node;
}

function topLevelRange(doc: import("@tiptap/pm/model").Node, pos: number): BlockRange | null {
  let acc = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    const from = acc;
    const to = acc + node.nodeSize;
    if (pos >= from && pos < to) return { index: i, from, to, node };
    acc = to;
  }
  return null;
}

function selectPos(tr: import("@tiptap/pm/state").Transaction, pos: number) {
  try {
    tr.setSelection(NodeSelection.create(tr.doc, pos));
  } catch {
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size))));
  }
}

function reorderBlock(editor: Editor, dir: "up" | "down"): void {
  const { state, view } = editor;
  const r = topLevelRange(state.doc, state.selection.from);
  if (!r) return;
  const target = dir === "up" ? r.index - 1 : r.index + 1;
  if (target < 0 || target >= state.doc.childCount) return;
  const nodes: import("@tiptap/pm/model").Node[] = [];
  state.doc.forEach((n) => nodes.push(n));
  [nodes[r.index], nodes[target]] = [nodes[target], nodes[r.index]];
  const tr = state.tr.replaceWith(0, state.doc.content.size, nodes);
  let newStart = 0;
  for (let i = 0; i < target; i++) newStart += nodes[i].nodeSize;
  selectPos(tr, newStart);
  view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

function duplicateBlock(editor: Editor): void {
  const r = topLevelRange(editor.state.doc, editor.state.selection.from);
  if (!r) return;
  editor.chain().insertContentAt(r.to, r.node.toJSON()).run();
}

function deleteBlock(editor: Editor): void {
  const r = topLevelRange(editor.state.doc, editor.state.selection.from);
  if (!r) return;
  editor.chain().focus().deleteRange({ from: r.from, to: r.to }).run();
}

/** Update the attributes of the atom node at `pos`, keeping it selected. */
function patchNode(editor: Editor, pos: number, patch: Record<string, unknown>): void {
  editor
    .chain()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
      try {
        tr.setSelection(NodeSelection.create(tr.doc, pos));
      } catch {
        /* leaf became non-selectable — ignore */
      }
      return true;
    })
    .run();
}

/** Insert a block after the current one; select it if it's an atom. */
function insertBlock(editor: Editor, json: Record<string, unknown>, selectAtom: boolean): void {
  const r = topLevelRange(editor.state.doc, editor.state.selection.from);
  const at = r ? r.to : editor.state.doc.content.size;
  editor.chain().focus().insertContentAt(at, json).run();
  if (selectAtom) {
    const tr = editor.state.tr;
    selectPos(tr, at);
    editor.view.dispatch(tr);
  }
}

// --- The editor hook --------------------------------------------------------

export function useEmailEditor(initialDoc: DocNode, onChange: (doc: DocNode) => void): Editor | null {
  return useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      TextStyle,
      Color,
      EmailImage,
      EmailTextAlign,
      Placeholder.configure({
        placeholder: "Write your email… or press '/' for blocks, or add them from the palette on the left.",
      }),
      EmailButton,
      EmailHeader,
      EmailFooter,
      EmailEmbed,
      EmailSpacer,
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        // The canvas is the email itself — always readable "paper".
        class: "prose-email min-h-[420px] px-6 py-5 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
  });
}

// --- Selection tracking -----------------------------------------------------

export interface Selected {
  pos: number;
  type: string;
  attrs: Record<string, unknown>;
  isAtom: boolean;
}

const ATOMS = new Set(["button", "header", "footer", "embed", "spacer", "image"]);

export function useSelectedBlock(editor: Editor | null): Selected | null {
  const [sel, setSel] = useState<Selected | null>(null);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { selection, doc } = editor.state;
      if (selection instanceof NodeSelection) {
        const node = selection.node;
        setSel({ pos: selection.from, type: node.type.name, attrs: { ...node.attrs }, isAtom: ATOMS.has(node.type.name) });
        return;
      }
      const r = topLevelRange(doc, selection.from);
      if (r) setSel({ pos: r.from, type: r.node.type.name, attrs: { ...r.node.attrs }, isAtom: false });
      else setSel(null);
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);
  return sel;
}

// --- Canvas -----------------------------------------------------------------

export function EmailCanvas({ editor, theme }: { editor: Editor | null; theme: EmailTheme }) {
  if (!editor) return <div className="min-h-[480px] rounded-xl border bg-muted/30" />;
  const font = FONT_STACKS[theme.font].stack;
  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40 shadow-sm">
      <FormattingToolbar editor={editor} />
      {/* A framed "sheet" that mimics the themed email so design choices are visible while editing. */}
      <div className="flex justify-center p-4 sm:p-6" style={{ background: theme.bg }}>
        <div
          className="w-full shadow-sm"
          style={{ maxWidth: theme.width, background: theme.canvas, borderRadius: theme.radius, color: theme.text, fontFamily: font }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <SlashMenu editor={editor} />
    </div>
  );
}

// --- Formatting toolbar (text-level) ----------------------------------------

function FormattingToolbar({ editor }: { editor: Editor }) {
  const setAlign = (align: "left" | "center" | "right") => {
    const type = editor.isActive("heading") ? "heading" : "paragraph";
    editor.chain().focus().updateAttributes(type, { textAlign: align }).run();
  };
  const activeAlign = (editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph").textAlign as string) || "left";

  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") return void editor.chain().focus().unsetLink().run();
    if (safeUrl(url) === "#") return void window.alert("Only http(s), mailto, and tel links are allowed.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-card/80 px-2 py-1.5 backdrop-blur">
      <Tool active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Heading 1"><Heading1 className="size-4" /></Tool>
      <Tool active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading 2"><Heading2 className="size-4" /></Tool>
      <Tool active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Heading 3"><Heading3 className="size-4" /></Tool>
      <Sep />
      <Tool active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold"><Bold className="size-4" /></Tool>
      <Tool active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic"><Italic className="size-4" /></Tool>
      <Tool active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="Strikethrough"><Strikethrough className="size-4" /></Tool>
      <Tool active={editor.isActive("link")} onClick={promptLink} label="Link"><Link2 className="size-4" /></Tool>
      <label className="ml-0.5 flex size-8 cursor-pointer items-center justify-center" title="Text color">
        <span className="size-4 rounded-full border" style={{ background: (editor.getAttributes("textStyle").color as string) || "#111827" }} />
        <input type="color" className="sr-only" value={(editor.getAttributes("textStyle").color as string) || "#111827"} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
      </label>
      <Sep />
      <Tool active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list"><List className="size-4" /></Tool>
      <Tool active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list"><ListOrdered className="size-4" /></Tool>
      <Tool active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote"><Quote className="size-4" /></Tool>
      <Sep />
      <Tool active={activeAlign === "left"} onClick={() => setAlign("left")} label="Align left"><AlignLeft className="size-4" /></Tool>
      <Tool active={activeAlign === "center"} onClick={() => setAlign("center")} label="Align center"><AlignCenter className="size-4" /></Tool>
      <Tool active={activeAlign === "right"} onClick={() => setAlign("right")} label="Align right"><AlignRight className="size-4" /></Tool>
    </div>
  );
}

function Tool({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} title={label} onClick={onClick}
      className={cn("flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", active && "bg-secondary text-foreground")}>
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px bg-border" />;

// --- Slash menu -------------------------------------------------------------

interface SlashItem { key: string; label: string; keywords: string; run: (editor: Editor) => void }

function slashItems(): SlashItem[] {
  return [
    { key: "h1", label: "Heading 1", keywords: "h1 title", run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: "Heading 2", keywords: "h2 subtitle", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "bullet", label: "Bulleted list", keywords: "ul unordered", run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "Numbered list", keywords: "ol ordered", run: (e) => e.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: "Quote", keywords: "blockquote", run: (e) => e.chain().focus().toggleBlockquote().run() },
    { key: "divider", label: "Divider", keywords: "hr rule line", run: (e) => e.chain().focus().setHorizontalRule().run() },
    { key: "button", label: "Button", keywords: "cta link", run: (e) => insertBlock(e, { type: "button", attrs: { label: "Get started", href: "{{action_url}}", bg: BRAND } }, true) },
    { key: "spacer", label: "Spacer", keywords: "space gap padding", run: (e) => insertBlock(e, { type: "spacer", attrs: { size: 24 } }, true) },
    { key: "embed", label: "Video / embed", keywords: "youtube video social media", run: (e) => insertBlock(e, { type: "embed", attrs: { title: "Watch the video" } }, true) },
    { key: "header", label: "Header / logo", keywords: "logo brand top banner", run: (e) => insertBlock(e, { type: "header", attrs: { align: "center" } }, true) },
    { key: "footer", label: "Footer", keywords: "footer unsubscribe social address", run: (e) => insertBlock(e, { type: "footer", attrs: { showUnsubscribe: true } }, true) },
  ];
}

function SlashMenu({ editor }: { editor: Editor }) {
  const items = useMemo(() => slashItems(), []);
  const [menu, setMenu] = useState({ open: false, query: "", top: 0, left: 0 });
  const [index, setIndex] = useState(0);

  const filtered = items.filter((it) => {
    const q = menu.query.toLowerCase();
    return !q || it.label.toLowerCase().includes(q) || it.keywords.includes(q);
  });

  useEffect(() => {
    const update = () => {
      const { selection } = editor.state;
      const { from, empty } = selection;
      const $from = editor.state.doc.resolve(from);
      const node = $from.parent;
      if (!empty || node.type.name !== "paragraph") return setMenu((p) => (p.open ? { ...p, open: false } : p));
      const before = node.textBetween(0, $from.parentOffset, undefined, "￼");
      const m = /^\/(\w*)$/.exec(before);
      if (!m) return setMenu((p) => (p.open ? { ...p, open: false } : p));
      const c = editor.view.coordsAtPos(from);
      setMenu({ open: true, query: m[1], top: c.bottom + 4, left: c.left });
      setIndex(0);
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
    };
  }, [editor]);

  const close = useCallback(() => setMenu((p) => ({ ...p, open: false })), []);
  const choose = useCallback(
    (item: SlashItem) => {
      const { from } = editor.state.selection;
      const start = from - (menu.query.length + 1);
      editor.chain().focus().deleteRange({ from: start, to: from }).run();
      item.run(editor);
      close();
    },
    [editor, menu.query, close],
  );

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const it = filtered[index]; if (it) choose(it); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu.open, filtered, index, choose, close]);

  if (!menu.open || filtered.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: menu.top, left: menu.left, zIndex: 50 }} className="w-56 overflow-hidden rounded-md border bg-card py-1 shadow-md">
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">Add a block</div>
      {filtered.map((it, i) => (
        <button key={it.key} type="button" onMouseDown={(e) => { e.preventDefault(); choose(it); }} onMouseEnter={() => setIndex(i)}
          className={cn("block w-full px-3 py-1.5 text-left text-sm", i === index ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-secondary/60")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// --- Right panel: Blocks palette / Design / Inspect -------------------------

type StudioTab = "blocks" | "design" | "inspect";

export function StudioPanel({
  editor,
  theme,
  setTheme,
  selected,
  tab,
  setTab,
  onAiSubject,
}: {
  editor: Editor | null;
  theme: EmailTheme;
  setTheme: (t: EmailTheme) => void;
  selected: Selected | null;
  tab: StudioTab;
  setTab: (t: StudioTab) => void;
  onAiSubject?: (subject: string) => void;
}) {
  const TABS: { id: StudioTab; label: string }[] = [
    { id: "blocks", label: "Blocks" },
    { id: "design", label: "Design" },
    { id: "inspect", label: "Inspect" },
  ];
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex gap-1 border-b p-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn("flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-[560px] overflow-y-auto p-3">
        {!editor ? null : tab === "blocks" ? (
          <BlocksPalette editor={editor} onInserted={() => setTab("inspect")} onAiSubject={onAiSubject} />
        ) : tab === "design" ? (
          <DesignPanel theme={theme} setTheme={setTheme} />
        ) : (
          <Inspector editor={editor} selected={selected} onSwitchToBlocks={() => setTab("blocks")} />
        )}
      </div>
    </div>
  );
}

const PALETTE: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "text", label: "Text", icon: Type, hint: "A paragraph" },
  { key: "h2", label: "Heading", icon: Heading2, hint: "Section title" },
  { key: "button", label: "Button", icon: MousePointerClick, hint: "A call to action" },
  { key: "image", label: "Image", icon: ImageIcon, hint: "Upload a picture" },
  { key: "bullet", label: "List", icon: List, hint: "Bulleted list" },
  { key: "video", label: "Video", icon: Video, hint: "YouTube / link poster" },
  { key: "divider", label: "Divider", icon: Minus, hint: "A horizontal line" },
  { key: "spacer", label: "Spacer", icon: MoveVertical, hint: "Vertical space" },
  { key: "header", label: "Header", icon: PanelTop, hint: "Logo or brand bar" },
  { key: "footer", label: "Footer", icon: PanelBottom, hint: "Social + unsubscribe" },
];

function BlocksPalette({ editor, onInserted, onAiSubject }: { editor: Editor; onInserted: () => void; onAiSubject?: (s: string) => void }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const add = async (key: string) => {
    switch (key) {
      case "text": return insertBlock(editor, { type: "paragraph" }, false);
      case "h2": return insertBlock(editor, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section title" }] }, false);
      case "bullet": return insertBlock(editor, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }, false);
      case "divider": return insertBlock(editor, { type: "horizontalRule" }, false);
      case "button": insertBlock(editor, { type: "button", attrs: { label: "Get started", href: "{{action_url}}", bg: BRAND } }, true); return onInserted();
      case "spacer": insertBlock(editor, { type: "spacer", attrs: { size: 24 } }, true); return onInserted();
      case "video": insertBlock(editor, { type: "embed", attrs: { title: "Watch the video" } }, true); return onInserted();
      case "header": insertBlock(editor, { type: "header", attrs: { align: "center" } }, true); return onInserted();
      case "footer": insertBlock(editor, { type: "footer", attrs: { showUnsubscribe: true } }, true); return onInserted();
      case "image": {
        const src = await pickAndUpload("image/*");
        if (!src) return;
        insertBlock(editor, { type: "image", attrs: { src, width: 100, align: "center" } }, true);
        return onInserted();
      }
    }
  };

  const runAi = async () => {
    const p = aiPrompt.trim();
    if (!p) return;
    setAiBusy(true);
    const res = await aiDraftAction(p);
    setAiBusy(false);
    if (res.error) return void window.alert(res.error);
    const blocks = res.blocks as DocNode | undefined;
    if (blocks?.content?.length) editor.chain().focus().insertContent(blocks.content).run();
    if (res.subject) onAiSubject?.(res.subject);
    setAiOpen(false);
    setAiPrompt("");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Click to add a block. It drops in below the block you&apos;re on — then tweak it under <span className="font-medium text-foreground">Inspect</span>.</p>
      <div className="grid grid-cols-2 gap-2">
        {PALETTE.map((b) => (
          <button key={b.key} type="button" onClick={() => add(b.key)}
            className="group flex items-center gap-2.5 rounded-lg border bg-background p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground group-hover:text-primary"><b.icon className="size-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{b.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{b.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        {aiOpen ? (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs"><Wand2 className="size-3.5 text-primary" /> Describe the email</Label>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} autoFocus
              placeholder="A friendly welcome for new users of my running-shoe store, with a discount button."
              className="w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
            <div className="flex gap-2">
              <button type="button" onClick={runAi} disabled={aiBusy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                {aiBusy ? "Drafting…" : "Draft it"}
              </button>
              <button type="button" onClick={() => setAiOpen(false)} className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAiOpen(true)} className="flex w-full items-center gap-2 text-left">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"><Sparkles className="size-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">Ask AI to write it</span>
              <span className="block text-[11px] text-muted-foreground">Describe it — get a full draft</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Design (theme) panel ---------------------------------------------------

function DesignPanel({ theme, setTheme }: { theme: EmailTheme; setTheme: (t: EmailTheme) => void }) {
  const set = (patch: Partial<EmailTheme>) => setTheme({ ...theme, ...patch });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Set the look of the whole email — it applies everywhere and is baked into what sends.</p>
      <Swatch label="Brand & buttons" value={theme.brand} onChange={(v) => set({ brand: v })} />
      <Swatch label="Page background" value={theme.bg} onChange={(v) => set({ bg: v })} />
      <Swatch label="Card background" value={theme.canvas} onChange={(v) => set({ canvas: v })} />
      <Swatch label="Body text" value={theme.text} onChange={(v) => set({ text: v })} />
      <Swatch label="Headings" value={theme.heading} onChange={(v) => set({ heading: v })} />

      <div className="space-y-1.5">
        <Label className="text-xs">Font</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(FONT_STACKS) as FontKey[]).map((k) => (
            <button key={k} type="button" onClick={() => set({ font: k })}
              className={cn("rounded-md border px-2 py-1.5 text-sm transition-colors", theme.font === k ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground")}
              style={{ fontFamily: FONT_STACKS[k].stack }}>
              {FONT_STACKS[k].label}
            </button>
          ))}
        </div>
      </div>

      <Slider label="Corner radius" value={theme.radius} min={0} max={28} unit="px" onChange={(v) => set({ radius: v })} />
      <div className="space-y-1.5">
        <Label className="text-xs">Content width</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {[480, 600, 720].map((w) => (
            <button key={w} type="button" onClick={() => set({ width: w })}
              className={cn("rounded-md border px-2 py-1.5 text-xs font-medium transition-colors", theme.width === w ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {w === 480 ? "Narrow" : w === 600 ? "Standard" : "Wide"}
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={() => setTheme({ ...DEFAULT_THEME })} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Reset to default theme
      </button>
    </div>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs">{label}</Label>
      <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2 py-1">
        <span className="size-5 rounded border" style={{ background: value }} />
        <span className="font-mono text-[11px] uppercase text-muted-foreground">{value}</span>
        <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#4f46e5"} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-[11px] text-muted-foreground">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

// --- Inspector --------------------------------------------------------------

function Inspector({ editor, selected, onSwitchToBlocks }: { editor: Editor; selected: Selected | null; onSwitchToBlocks: () => void }) {
  if (!selected) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <p>Click a block in the email to edit it here.</p>
        <button type="button" onClick={onSwitchToBlocks} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Plus className="size-3.5" /> Or add a new block
        </button>
      </div>
    );
  }

  const patch = (p: Record<string, unknown>) => patchNode(editor, selected.pos, p);
  const TITLES: Record<string, string> = { button: "Button", image: "Image", header: "Header", footer: "Footer", embed: "Video / embed", spacer: "Spacer", paragraph: "Text", heading: "Heading", bulletList: "List", orderedList: "List", blockquote: "Quote", horizontalRule: "Divider" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{TITLES[selected.type] ?? "Block"}</p>
        <BlockActions editor={editor} />
      </div>

      {selected.type === "button" && <ButtonFields attrs={selected.attrs} patch={patch} />}
      {selected.type === "image" && <ImageFields attrs={selected.attrs} patch={patch} />}
      {selected.type === "header" && <HeaderFields attrs={selected.attrs} patch={patch} />}
      {selected.type === "footer" && <FooterFields attrs={selected.attrs} patch={patch} />}
      {selected.type === "embed" && <EmbedFields attrs={selected.attrs} patch={patch} />}
      {selected.type === "spacer" && <SpacerFields attrs={selected.attrs} patch={patch} />}
      {(selected.type === "paragraph" || selected.type === "heading") && <TextBlockFields editor={editor} type={selected.type} />}
      {["bulletList", "orderedList", "blockquote", "horizontalRule"].includes(selected.type) && (
        <p className="text-xs text-muted-foreground">Edit this block right in the email. Use the toolbar above the canvas to format it.</p>
      )}
    </div>
  );
}

function BlockActions({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5">
      <IconBtn label="Move up" onClick={() => reorderBlock(editor, "up")}><ChevronUp className="size-4" /></IconBtn>
      <IconBtn label="Move down" onClick={() => reorderBlock(editor, "down")}><ChevronDown className="size-4" /></IconBtn>
      <IconBtn label="Duplicate" onClick={() => duplicateBlock(editor)}><Copy className="size-3.5" /></IconBtn>
      <IconBtn label="Delete" onClick={() => deleteBlock(editor)} danger><Trash2 className="size-3.5" /></IconBtn>
    </div>
  );
}
function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className={cn("flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary", danger ? "hover:text-destructive" : "hover:text-foreground")}>
      {children}
    </button>
  );
}

// Small field primitives -----------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
const inputCls = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary";

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(inputCls, mono && "font-mono text-xs")} />;
}

function AlignPicker({ value, onChange }: { value: string; onChange: (v: "left" | "center" | "right") => void }) {
  const opts: { id: "left" | "center" | "right"; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "left", icon: AlignLeft }, { id: "center", icon: AlignCenter }, { id: "right", icon: AlignRight },
  ];
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {opts.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={cn("flex size-7 items-center justify-center rounded", value === o.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <o.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, fallback, onChange, clearable }: { label: string; value: string; fallback: string; onChange: (v: string) => void; clearable?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border bg-background px-2 py-1.5">
          <span className="size-5 rounded border" style={{ background: value || "transparent" }} />
          <span className="font-mono text-[11px] uppercase text-muted-foreground">{value || "none"}</span>
          <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value)} />
        </label>
        {clearable && value ? <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground" title="Clear"><X className="size-4" /></button> : null}
      </div>
    </Field>
  );
}

// Per-block inspectors -------------------------------------------------------

function ButtonFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Label"><TextInput value={String(attrs.label ?? "")} onChange={(v) => patch({ label: v })} placeholder="Get started" /></Field>
      <Field label="Link"><TextInput value={String(attrs.href ?? "")} onChange={(v) => patch({ href: v })} placeholder="{{action_url}}" mono /></Field>
      <ColorField label="Button color" value={String(attrs.bg ?? BRAND)} fallback={BRAND} onChange={(v) => patch({ bg: v })} />
      <Field label="Alignment"><AlignPicker value={String(attrs.align ?? "left")} onChange={(v) => patch({ align: v })} /></Field>
      <p className="text-[11px] text-muted-foreground">Use <span className="font-mono">{"{{action_url}}"}</span> to send each recipient to a personalized link.</p>
    </div>
  );
}

function ImageFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const replace = async () => { const src = await pickAndUpload("image/*"); if (src) patch({ src }); };
  return (
    <div className="space-y-3">
      {attrs.src ? <img src={String(attrs.src)} alt="" className="max-h-28 w-full rounded-md border object-contain" /> : null}
      <button type="button" onClick={replace} className="w-full rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-secondary">Replace image…</button>
      <Field label="Alt text (accessibility)"><TextInput value={String(attrs.alt ?? "")} onChange={(v) => patch({ alt: v })} placeholder="Describe the image" /></Field>
      <Slider label="Width" value={Number(attrs.width ?? 100)} min={20} max={100} unit="%" onChange={(v) => patch({ width: v })} />
      <Field label="Alignment"><AlignPicker value={String(attrs.align ?? "center")} onChange={(v) => patch({ align: v })} /></Field>
      <Field label="Links to (optional)"><TextInput value={String(attrs.href ?? "")} onChange={(v) => patch({ href: v })} placeholder="https://…" mono /></Field>
    </div>
  );
}

function HeaderFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const upload = async () => { const logo = await pickAndUpload("image/*"); if (logo) patch({ logo }); };
  return (
    <div className="space-y-3">
      {attrs.logo ? (
        <div className="flex items-center gap-2">
          <img src={String(attrs.logo)} alt="logo" className="max-h-10 rounded border bg-white p-1" />
          <button type="button" onClick={() => patch({ logo: "" })} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={upload} className="w-full rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-secondary">Upload a logo…</button>
      )}
      {!attrs.logo ? <Field label="Brand name (if no logo)"><TextInput value={String(attrs.brandName ?? "")} onChange={(v) => patch({ brandName: v })} placeholder="Acme" /></Field> : null}
      <ColorField label="Bar background" value={String(attrs.bg ?? "")} fallback="#111827" onChange={(v) => patch({ bg: v })} clearable />
      <Field label="Alignment"><AlignPicker value={String(attrs.align ?? "center")} onChange={(v) => patch({ align: v })} /></Field>
    </div>
  );
}

function FooterFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const social = Array.isArray(attrs.social) ? (attrs.social as { platform?: string; url?: string }[]) : [];
  const setSocial = (next: { platform?: string; url?: string }[]) => patch({ social: next });
  const PLATFORMS = ["x", "instagram", "facebook", "linkedin", "youtube", "tiktok", "github", "website"];
  return (
    <div className="space-y-3">
      <Field label="Company / address line"><TextInput value={String(attrs.address ?? "")} onChange={(v) => patch({ address: v })} placeholder="Acme Inc · 123 Main St, City" /></Field>
      <div className="space-y-1.5">
        <Label className="text-xs">Social links</Label>
        {social.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select value={s.platform ?? "website"} onChange={(e) => setSocial(social.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
              className="rounded-md border bg-background px-1.5 py-1.5 text-xs capitalize outline-none">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={s.url ?? ""} onChange={(e) => setSocial(social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…"
              className={cn(inputCls, "flex-1 font-mono text-xs")} />
            <button type="button" onClick={() => setSocial(social.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setSocial([...social, { platform: "website", url: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="size-3.5" /> Add link</button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={attrs.showUnsubscribe !== false} onChange={(e) => patch({ showUnsubscribe: e.target.checked })} className="accent-primary" />
        Show unsubscribe link
      </label>
      <p className="text-[11px] text-muted-foreground">Marketing emails always include a working unsubscribe + your postal address to stay compliant — we add it automatically.</p>
    </div>
  );
}

function EmbedFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  const [raw, setRaw] = useState(String(attrs.url ?? ""));
  const apply = () => {
    const d = deriveEmbed(raw);
    if (!d) return void window.alert("That doesn't look like a valid http(s) link.");
    patch({ url: d.url, thumbnail: d.thumbnail, title: d.title });
  };
  return (
    <div className="space-y-3">
      <Field label="Video or link URL">
        <div className="flex gap-1.5">
          <input value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={apply} placeholder="https://youtube.com/watch?v=…" className={cn(inputCls, "flex-1 font-mono text-xs")} />
          <button type="button" onClick={apply} className="rounded-md border px-2.5 text-sm hover:bg-secondary">Set</button>
        </div>
      </Field>
      {attrs.thumbnail ? <img src={String(attrs.thumbnail)} alt="" className="w-full rounded-md border" /> : null}
      <Field label="Caption"><TextInput value={String(attrs.title ?? "")} onChange={(v) => patch({ title: v })} placeholder="Watch the video" /></Field>
      <p className="text-[11px] text-muted-foreground">Inboxes can&apos;t play video, so this becomes a clickable poster that opens the link — the reliable way to share video in email.</p>
    </div>
  );
}

function SpacerFields({ attrs, patch }: { attrs: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
  return <Slider label="Height" value={Number(attrs.size ?? 24)} min={4} max={120} unit="px" onChange={(v) => patch({ size: v })} />;
}

function TextBlockFields({ editor, type }: { editor: Editor; type: string }) {
  const align = (editor.getAttributes(type).textAlign as string) || "left";
  const setAlign = (a: "left" | "center" | "right") => editor.chain().focus().updateAttributes(type, { textAlign: a }).run();
  return (
    <div className="space-y-3">
      <Field label="Alignment"><AlignPicker value={align} onChange={setAlign} /></Field>
      {type === "heading" ? (
        <Field label="Level">
          <div className="inline-flex rounded-md border p-0.5">
            {[1, 2, 3].map((l) => (
              <button key={l} type="button" onClick={() => editor.chain().focus().setHeading({ level: l as 1 | 2 | 3 }).run()} aria-pressed={editor.isActive("heading", { level: l })}
                className={cn("rounded px-2.5 py-1 text-sm font-medium", editor.isActive("heading", { level: l }) ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
                H{l}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <p className="text-[11px] text-muted-foreground">Type directly in the email. Select text to make it bold, colored, or a link.</p>
    </div>
  );
}
