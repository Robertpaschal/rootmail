"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
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
  PanelTop,
  PanelBottom,
  Quote,
  Sparkles,
  Video,
} from "lucide-react";
import { aiDraftAction, uploadAssetAction } from "./actions";
import { BRAND, type DocNode, safeUrl } from "@/lib/email-doc";
import { cn } from "@/lib/utils";

// A CTA button as a first-class, atomic node so it round-trips through the doc.
const EmailButton = Node.create({
  name: "button",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { label: { default: "Get started" }, href: { default: "" }, bg: { default: BRAND } };
  },
  parseHTML() {
    return [{ tag: "a[data-rm-button]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-rm-button": "",
        href: node.attrs.href,
        style: `display:inline-block;padding:10px 20px;border-radius:6px;background:${node.attrs.bg};color:#fff;font-weight:600;text-decoration:none;cursor:pointer;`,
      }),
      node.attrs.label,
    ];
  },
});

// Header/footer/embed are atomic "chrome" nodes — the real email HTML comes from
// lib/email-doc.ts; these renderHTML are just labelled placeholders in-editor.
function chromeNode(name: string, label: (attrs: Record<string, unknown>) => string, attrs: Record<string, { default: unknown }>) {
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
const EmailEmbed = chromeNode("embed", (a) => `▶ ${String(a.title || "Embed")}`, {
  url: { default: "" },
  thumbnail: { default: "" },
  title: { default: "Watch the video" },
});

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
function deriveEmbed(raw: string): { url: string; thumbnail: string; title: string } | null {
  const url = safeUrl(raw);
  if (url === "#") return null;
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return { url, thumbnail: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`, title: "Watch on YouTube" };
  return { url, thumbnail: "", title: "Open link" };
}

function parseSocial(raw: string): { platform: string; url: string }[] {
  return raw
    .split(",")
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx < 0) return null;
      const platform = pair.slice(0, idx).trim();
      const url = safeUrl(pair.slice(idx + 1).trim());
      return platform && url !== "#" ? { platform, url } : null;
    })
    .filter((x): x is { platform: string; url: string } => x !== null);
}

interface SlashItem {
  key: string;
  label: string;
  keywords: string;
  run: (editor: Editor) => void | Promise<void>;
}

export function WritingEditor({
  initialDoc,
  onChange,
  onSubject,
}: {
  initialDoc: DocNode;
  onChange: (doc: DocNode) => void;
  onSubject?: (subject: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      TextStyle,
      Color,
      Image,
      Placeholder.configure({
        placeholder: "Write your email… or press '/' for headings, images, embeds, a footer, or Ask AI.",
      }),
      EmailButton,
      EmailHeader,
      EmailFooter,
      EmailEmbed,
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        // The canvas is the email itself — always white "paper" with dark text, so
        // it stays readable (and truthful to the final render) in dark mode, where
        // the inherited foreground would otherwise be light-on-white = invisible.
        class:
          "prose-email min-h-[360px] rounded-md border bg-white px-4 py-3 text-sm leading-relaxed text-zinc-900 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocNode),
  });

  // Keep the editor in sync if the template loads after mount.
  useEffect(() => {
    if (editor && initialDoc && editor.isEmpty) {
      editor.commands.setContent(initialDoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const insertHeader = useCallback(async (e: Editor) => {
    const logo = await pickAndUpload("image/*");
    if (logo) {
      e.chain().focus().insertContent({ type: "header", attrs: { logo, align: "center" } }).run();
      return;
    }
    const brandName = window.prompt("Brand name (shown if no logo)") ?? "";
    e.chain().focus().insertContent({ type: "header", attrs: { brandName, align: "center" } }).run();
  }, []);

  const insertFooter = useCallback((e: Editor) => {
    const address = window.prompt("Footer address / company line (optional)", "") ?? "";
    const social = parseSocial(
      window.prompt("Social links — platform:url, comma-separated (e.g. x:https://x.com/acme)", "") ?? "",
    );
    e.chain().focus().insertContent({ type: "footer", attrs: { address, social, showUnsubscribe: true } }).run();
  }, []);

  const insertImage = useCallback(async (e: Editor) => {
    const src = await pickAndUpload("image/*");
    if (src) e.chain().focus().setImage({ src }).run();
  }, []);

  const insertEmbed = useCallback((e: Editor) => {
    const raw = window.prompt("Video or social URL (YouTube, X, …)");
    if (!raw) return;
    const embed = deriveEmbed(raw);
    if (!embed) {
      window.alert("That doesn't look like a valid http(s) link.");
      return;
    }
    e.chain().focus().insertContent({ type: "embed", attrs: embed }).run();
  }, []);

  const askAi = useCallback(
    async (e: Editor) => {
      const prompt = window.prompt("Describe the email you want AI to draft:");
      if (!prompt) return;
      const res = await aiDraftAction(prompt);
      if (res.error) {
        window.alert(res.error);
        return;
      }
      const blocks = res.blocks as DocNode | undefined;
      if (blocks?.content?.length) e.chain().focus().insertContent(blocks.content).run();
      if (res.subject) onSubject?.(res.subject);
    },
    [onSubject],
  );

  const slashItems = useMemo<SlashItem[]>(
    () => [
      { key: "h1", label: "Heading 1", keywords: "h1 title", run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
      { key: "h2", label: "Heading 2", keywords: "h2 subtitle", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
      { key: "h3", label: "Heading 3", keywords: "h3", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
      { key: "bullet", label: "Bulleted list", keywords: "ul unordered", run: (e) => e.chain().focus().toggleBulletList().run() },
      { key: "ordered", label: "Numbered list", keywords: "ol ordered", run: (e) => e.chain().focus().toggleOrderedList().run() },
      { key: "quote", label: "Quote", keywords: "blockquote", run: (e) => e.chain().focus().toggleBlockquote().run() },
      { key: "divider", label: "Divider", keywords: "hr rule line", run: (e) => e.chain().focus().setHorizontalRule().run() },
      {
        key: "button",
        label: "Button",
        keywords: "cta link",
        run: (e) => {
          const label = window.prompt("Button label", "Get started");
          if (label === null) return;
          const href = window.prompt("Button link", "{{action_url}}") ?? "";
          e.chain().focus().insertContent({ type: "button", attrs: { label, href, bg: BRAND } }).run();
        },
      },
      { key: "image", label: "Image (upload)", keywords: "img picture photo upload file", run: insertImage },
      { key: "embed", label: "Video / social embed", keywords: "youtube video social embed media", run: insertEmbed },
      { key: "header", label: "Header / logo", keywords: "logo brand top banner", run: insertHeader },
      { key: "footer", label: "Footer (social + unsubscribe)", keywords: "footer unsubscribe social address", run: insertFooter },
      { key: "ai", label: "Ask AI to write this", keywords: "ai claude generate draft write", run: askAi },
    ],
    [insertImage, insertEmbed, insertHeader, insertFooter, askAi],
  );

  if (!editor) {
    return <div className="min-h-[360px] rounded-md border bg-muted/30" />;
  }

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} onImage={() => insertImage(editor)} onEmbed={() => insertEmbed(editor)} onAi={() => askAi(editor)} />
      <EditorContent editor={editor} />
      <SlashMenu editor={editor} items={slashItems} />
      {editor.isEmpty ? <CommandHints /> : null}
      <p className="text-xs text-muted-foreground">
        Tip: type <span className="font-mono">/</span> on a new line for headings, images, embeds, a
        footer, or <span className="font-medium">Ask AI</span>.
      </p>
    </div>
  );
}

// Notion-style hint: surfaces the available "/" commands before the user writes.
function CommandHints() {
  const hints = [
    "/heading — section titles",
    "/image — upload a picture",
    "/embed — YouTube or social",
    "/footer — social + unsubscribe",
    "/ai — let AI draft it",
  ];
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Try a command</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {hints.map((h) => (
          <span key={h} className="font-mono">
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

// Notion-style "/" menu: type "/" at the start of an empty line to insert a block.
function SlashMenu({ editor, items }: { editor: Editor; items: SlashItem[] }) {
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
      if (!empty || node.type.name !== "paragraph") {
        setMenu((p) => (p.open ? { ...p, open: false } : p));
        return;
      }
      const before = node.textBetween(0, $from.parentOffset, undefined, "￼");
      const m = /^\/(\w*)$/.exec(before);
      if (!m) {
        setMenu((p) => (p.open ? { ...p, open: false } : p));
        return;
      }
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
      const start = from - (menu.query.length + 1); // remove the "/query" text
      editor.chain().focus().deleteRange({ from: start, to: from }).run();
      void item.run(editor);
      close();
    },
    [editor, menu.query, close],
  );

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const it = filtered[index];
        if (it) choose(it);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menu.open, filtered, index, choose, close]);

  if (!menu.open || filtered.length === 0) return null;

  return (
    <div
      style={{ position: "fixed", top: menu.top, left: menu.left, zIndex: 50 }}
      className="w-60 overflow-hidden rounded-md border bg-card py-1 shadow-md"
    >
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">Blocks &amp; commands</div>
      {filtered.map((it, i) => (
        <button
          key={it.key}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            choose(it);
          }}
          onMouseEnter={() => setIndex(i)}
          className={cn(
            "block w-full px-3 py-1.5 text-left text-sm",
            i === index ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-secondary/60",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Toolbar({
  editor,
  onImage,
  onEmbed,
  onAi,
}: {
  editor: Editor;
  onImage: () => void;
  onEmbed: () => void;
  onAi: () => void;
}) {
  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (safeUrl(url) === "#") {
      window.alert("Only http(s), mailto, and tel links are allowed.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertButton = () => {
    const label = window.prompt("Button label", "Get started");
    if (label === null) return;
    const href = window.prompt("Button link", "{{action_url}}") ?? "";
    editor.chain().focus().insertContent({ type: "button", attrs: { label, href, bg: BRAND } }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-card p-1">
      <Btn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Heading 1">
        <Heading1 className="size-4" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading 2">
        <Heading2 className="size-4" />
      </Btn>
      <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="Heading 3">
        <Heading3 className="size-4" />
      </Btn>
      <Divider />
      <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
        <Bold className="size-4" />
      </Btn>
      <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
        <Italic className="size-4" />
      </Btn>
      <Btn active={editor.isActive("link")} onClick={promptLink} label="Link">
        <Link2 className="size-4" />
      </Btn>
      <label className="ml-0.5 flex size-8 cursor-pointer items-center justify-center" title="Text color">
        <span
          className="size-4 rounded-full border"
          style={{ background: (editor.getAttributes("textStyle").color as string) || "#111827" }}
        />
        <input
          type="color"
          className="sr-only"
          value={(editor.getAttributes("textStyle").color as string) || "#111827"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>
      <Divider />
      <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list">
        <List className="size-4" />
      </Btn>
      <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
        <ListOrdered className="size-4" />
      </Btn>
      <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Quote">
        <Quote className="size-4" />
      </Btn>
      <Divider />
      <Btn onClick={insertButton} label="Button">
        <MousePointerClick className="size-4" />
      </Btn>
      <Btn onClick={onImage} label="Upload image">
        <ImageIcon className="size-4" />
      </Btn>
      <Btn onClick={onEmbed} label="Video / social embed">
        <Video className="size-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().insertContent({ type: "header", attrs: { align: "center" } }).run()} label="Header">
        <PanelTop className="size-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().insertContent({ type: "footer", attrs: { showUnsubscribe: true } }).run()} label="Footer">
        <PanelBottom className="size-4" />
      </Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Divider">
        <Minus className="size-4" />
      </Btn>
      <Divider />
      <Btn onClick={onAi} label="Ask AI">
        <Sparkles className="size-4" />
      </Btn>
    </div>
  );
}

function Btn({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
