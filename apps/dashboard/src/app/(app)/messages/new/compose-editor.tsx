"use client";

import { useCallback, useEffect, useState } from "react";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Loader2, Sparkles } from "lucide-react";
import { aiDraftAction } from "../../templates/actions";
import { safeUrl, type DocNode } from "@/lib/email-doc";
import { cn } from "@/lib/utils";

// A lean, Gmail-style rich composer — bold/italic/lists/links, and "/" to let AI
// draft the email. Deliberately NOT the template studio: this is for quick, personal
// one-off mail. It emits semantic HTML that the send-form wraps and sends.

/** Map an AI email-doc draft down to the simple nodes this composer supports. */
function toComposeContent(doc: DocNode | undefined): DocNode[] {
  const out: DocNode[] = [];
  for (const n of doc?.content ?? []) {
    switch (n.type) {
      case "heading":
      case "paragraph":
      case "bulletList":
      case "orderedList":
        out.push(n);
        break;
      case "button":
      case "embed": {
        const label = String(n.attrs?.label ?? n.attrs?.title ?? "Link");
        const href = safeUrl(n.attrs?.href ?? n.attrs?.url);
        out.push({ type: "paragraph", content: [{ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] }] });
        break;
      }
      // header / footer / image / divider are template chrome — skip for compose.
    }
  }
  return out.length ? out : [{ type: "paragraph" }];
}

interface AiState {
  open: boolean;
  prompt: string;
  busy: boolean;
}

export function ComposeEditor({ onHtml, onSubject }: { onHtml: (html: string) => void; onSubject?: (s: string) => void }) {
  const [ai, setAi] = useState<AiState>({ open: false, prompt: "", busy: false });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } } }),
      Placeholder.configure({ placeholder: "Write your email…   ( press / for a menu — or to ask AI )" }),
    ],
    editorProps: { attributes: { class: "min-h-[220px] focus:outline-none text-sm leading-relaxed" } },
    onUpdate: ({ editor }) => onHtml(editor.getHTML()),
  });

  const openAi = useCallback(() => setAi({ open: true, prompt: "", busy: false }), []);

  const runAi = useCallback(async () => {
    if (!editor) return;
    const p = ai.prompt.trim();
    if (!p) return;
    setAi((s) => ({ ...s, busy: true }));
    const res = await aiDraftAction(p);
    if (res.error) {
      setAi((s) => ({ ...s, busy: false }));
      window.alert(res.error);
      return;
    }
    editor.chain().focus().insertContent(toComposeContent(res.blocks as DocNode | undefined)).run();
    if (res.subject) onSubject?.(res.subject);
    setAi({ open: false, prompt: "", busy: false });
  }, [ai.prompt, editor, onSubject]);

  if (!editor) return <div className="min-h-[220px] rounded-md bg-muted/30" />;

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} onAi={openAi} />
      <EditorContent editor={editor} />
      <ComposeSlash editor={editor} onAiPick={openAi} />

      {ai.open ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="size-3.5 text-primary" /> What should this email say?
          </div>
          <textarea
            autoFocus
            value={ai.prompt}
            onChange={(e) => setAi((s) => ({ ...s, prompt: e.target.value }))}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runAi(); }}
            rows={3}
            placeholder="A short thank-you to a customer who just placed their first order, warm and specific."
            className="w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={runAi} disabled={ai.busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
              {ai.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {ai.busy ? "Drafting…" : "Draft it"}
            </button>
            <button type="button" onClick={() => setAi({ open: false, prompt: "", busy: false })} className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Toolbar({ editor, onAi }: { editor: Editor; onAi: () => void }) {
  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") return void editor.chain().focus().unsetLink().run();
    if (safeUrl(url) === "#") return void window.alert("Only http(s), mailto, and tel links are allowed.");
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border bg-card p-1">
      <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold"><Bold className="size-4" /></Btn>
      <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic"><Italic className="size-4" /></Btn>
      <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Heading"><Heading2 className="size-4" /></Btn>
      <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bulleted list"><List className="size-4" /></Btn>
      <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list"><ListOrdered className="size-4" /></Btn>
      <Btn active={editor.isActive("link")} onClick={promptLink} label="Link"><Link2 className="size-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <button type="button" onClick={onAi} className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
        <Sparkles className="size-3.5" /> Ask AI
      </button>
    </div>
  );
}

function Btn({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} title={label} onClick={onClick}
      className={cn("flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground", active && "bg-secondary text-foreground")}>
      {children}
    </button>
  );
}

// The "/" menu — headings/lists plus the star turn: hand it to AI.
interface SlashItem { key: string; label: string; run: (e: Editor) => void }

function ComposeSlash({ editor, onAiPick }: { editor: Editor; onAiPick: () => void }) {
  const items: SlashItem[] = [
    { key: "ai", label: "✨ Ask AI to write this", run: () => onAiPick() },
    { key: "h2", label: "Heading", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "bullet", label: "Bulleted list", run: (e) => e.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: "Numbered list", run: (e) => e.chain().focus().toggleOrderedList().run() },
  ];
  const [menu, setMenu] = useState({ open: false, query: "", top: 0, left: 0 });
  const [index, setIndex] = useState(0);
  const filtered = items.filter((it) => !menu.query || it.label.toLowerCase().includes(menu.query));

  useEffect(() => {
    const update = () => {
      const { selection } = editor.state;
      const { from, empty } = selection;
      const $from = editor.state.doc.resolve(from);
      if (!empty || $from.parent.type.name !== "paragraph") return setMenu((p) => (p.open ? { ...p, open: false } : p));
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
      const m = /^\/(\w*)$/.exec(before);
      if (!m) return setMenu((p) => (p.open ? { ...p, open: false } : p));
      const c = editor.view.coordsAtPos(from);
      setMenu({ open: true, query: m[1].toLowerCase(), top: c.bottom + 4, left: c.left });
      setIndex(0);
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    return () => { editor.off("selectionUpdate", update); editor.off("update", update); };
  }, [editor]);

  const close = useCallback(() => setMenu((p) => ({ ...p, open: false })), []);
  const choose = useCallback((item: SlashItem) => {
    const { from } = editor.state.selection;
    const start = from - (menu.query.length + 1);
    editor.chain().focus().deleteRange({ from: start, to: from }).run();
    item.run(editor);
    close();
  }, [editor, menu.query, close]);

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
      {filtered.map((it, i) => (
        <button key={it.key} type="button" onMouseDown={(e) => { e.preventDefault(); choose(it); }} onMouseEnter={() => setIndex(i)}
          className={cn("block w-full px-3 py-1.5 text-left text-sm", i === index ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-secondary/60")}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
