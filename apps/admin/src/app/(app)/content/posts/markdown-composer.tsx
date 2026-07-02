"use client";

import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  TextQuote,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Write like Notion, store markdown. The textarea stays the source of truth (so the
// safe react-markdown pipeline is untouched); this composer just writes the syntax
// for you: a "/" menu at the caret for blocks, a quiet toolbar for inline formats,
// and Cmd/Ctrl+B·I·K. No editor dependency — plain text surgery.

interface BlockItem {
  id: string;
  label: string;
  hint: string;
  icon: typeof Heading2;
  keywords: string;
  apply: (api: SurgeryApi) => void;
}

interface SurgeryApi {
  value: string;
  selStart: number;
  selEnd: number;
  set: (next: string, selStart: number, selEnd: number) => void;
}

// ---- text surgery ----------------------------------------------------------

function lineStartOf(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

/** Wrap the selection (or a placeholder) with inline markers, keeping it selected. */
function wrapInline(api: SurgeryApi, before: string, after: string, placeholder: string): void {
  const { value, selStart, selEnd } = api;
  const selected = value.slice(selStart, selEnd) || placeholder;
  const next = value.slice(0, selStart) + before + selected + after + value.slice(selEnd);
  api.set(next, selStart + before.length, selStart + before.length + selected.length);
}

/** Prefix every selected line (toggling off when all already have it). */
function prefixLines(api: SurgeryApi, prefix: string, numbered = false): void {
  const { value, selStart, selEnd } = api;
  const start = lineStartOf(value, selStart);
  const endIdx = value.indexOf("\n", Math.max(selEnd - 1, selStart));
  const end = endIdx === -1 ? value.length : endIdx;
  const lines = value.slice(start, end).split("\n");
  const stripped = lines.map((l) => l.replace(/^(#{1,6}\s|>\s|-\s|\d+\.\s)/, ""));
  const allHad = !numbered && lines.every((l) => l.startsWith(prefix));
  const nextLines = allHad
    ? stripped
    : stripped.map((l, i) => (numbered ? `${i + 1}. ${l}` : `${prefix}${l}`));
  const block = nextLines.join("\n");
  const next = value.slice(0, start) + block + value.slice(end);
  api.set(next, start, start + block.length);
}

/** Insert a standalone block (divider / code fence) on its own lines at the caret. */
function insertBlock(api: SurgeryApi, block: string, caretOffset: number): void {
  const { value, selStart } = api;
  const start = lineStartOf(value, selStart);
  const needsGap = start > 0 && value[start - 1] === "\n" && value[start - 2] !== "\n" ? "\n" : "";
  const next = value.slice(0, start) + needsGap + block + value.slice(start);
  const caret = start + needsGap.length + caretOffset;
  api.set(next, caret, caret);
}

const BLOCKS: BlockItem[] = [
  { id: "h2", label: "Heading", hint: "## Large section", icon: Heading2, keywords: "heading h2 title section", apply: (a) => prefixLines(a, "## ") },
  { id: "h3", label: "Subheading", hint: "### Smaller section", icon: Heading3, keywords: "subheading h3", apply: (a) => prefixLines(a, "### ") },
  { id: "bullet", label: "Bulleted list", hint: "- item", icon: List, keywords: "bullet unordered list ul", apply: (a) => prefixLines(a, "- ") },
  { id: "numbered", label: "Numbered list", hint: "1. item", icon: ListOrdered, keywords: "numbered ordered list ol", apply: (a) => prefixLines(a, "", true) },
  { id: "quote", label: "Quote", hint: "> pull quote", icon: TextQuote, keywords: "quote blockquote", apply: (a) => prefixLines(a, "> ") },
  { id: "code", label: "Code block", hint: "``` fenced code", icon: Code, keywords: "code fence snippet", apply: (a) => insertBlock(a, "```\n\n```\n", 4) },
  { id: "divider", label: "Divider", hint: "--- horizontal rule", icon: Minus, keywords: "divider rule separator hr", apply: (a) => insertBlock(a, "---\n\n", 5) },
];

// ---- caret position (mirror-div measurement) --------------------------------

const MIRRORED = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "paddingTop",
  "paddingLeft",
  "paddingRight",
  "borderLeftWidth",
] as const;

function caretTopLeft(el: HTMLTextAreaElement, pos: number): { top: number; left: number } {
  const div = document.createElement("div");
  const style = getComputedStyle(el);
  for (const p of MIRRORED) div.style[p] = style[p];
  div.style.position = "absolute";
  div.style.top = "0";
  div.style.left = "0";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.width = `${el.clientWidth}px`;
  div.textContent = el.value.slice(0, pos);
  const marker = document.createElement("span");
  marker.textContent = "​";
  div.appendChild(marker);
  el.parentElement!.appendChild(div);
  const out = { top: marker.offsetTop, left: marker.offsetLeft };
  div.remove();
  return out;
}

// ---- the composer ------------------------------------------------------------

export function MarkdownComposer({
  name,
  value,
  onChange,
  placeholder,
  textareaRef,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;
  const [menu, setMenu] = useState<{ at: number; query: string; top: number; left: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const autogrow = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
    }
  }, [ref]);
  useEffect(autogrow, [autogrow]);

  const api = useCallback(
    (): SurgeryApi => ({
      value,
      selStart: ref.current?.selectionStart ?? value.length,
      selEnd: ref.current?.selectionEnd ?? value.length,
      set: (next, s, e) => {
        onChange(next);
        requestAnimationFrame(() => {
          const el = ref.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(s, e);
          autogrow();
        });
      },
    }),
    [value, onChange, ref, autogrow],
  );

  const matches = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    return BLOCKS.filter((b) => !q || b.label.toLowerCase().includes(q) || b.keywords.includes(q));
  }, [menu]);

  /** Open/refresh the slash menu when the caret sits after "/query" at a line start. */
  const syncMenu = (el: HTMLTextAreaElement) => {
    const pos = el.selectionStart;
    const lineStart = lineStartOf(el.value, pos);
    const beforeCaret = el.value.slice(lineStart, pos);
    const m = /^\s*\/([\w-]*)$/.exec(beforeCaret);
    if (m) {
      const at = lineStart + beforeCaret.indexOf("/");
      // Anchor one line below the caret, within the relative wrapper.
      const { top, left } = caretTopLeft(el, at);
      setMenu({ at, query: m[1], top: el.offsetTop + top + 26, left: el.offsetLeft + left });
      setHighlight(0);
    } else if (menu) {
      setMenu(null);
    }
  };

  const pick = (item: BlockItem) => {
    if (!menu) return;
    // Remove the "/query" trigger text, then apply the block at that caret.
    const el = ref.current;
    const pos = el?.selectionStart ?? menu.at + 1 + menu.query.length;
    const cleaned = value.slice(0, menu.at) + value.slice(pos);
    const a: SurgeryApi = { ...api(), value: cleaned, selStart: menu.at, selEnd: menu.at };
    setMenu(null);
    item.apply(a);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[highlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      wrapInline(api(), "**", "**", "bold");
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      wrapInline(api(), "*", "*", "italic");
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      wrapInline(api(), "[", "](https://)", "link text");
    }
  };

  const tools: { label: string; icon: typeof Bold; run: () => void }[] = [
    { label: "Heading", icon: Heading2, run: () => prefixLines(api(), "## ") },
    { label: "Subheading", icon: Heading3, run: () => prefixLines(api(), "### ") },
    { label: "Bold (⌘B)", icon: Bold, run: () => wrapInline(api(), "**", "**", "bold") },
    { label: "Italic (⌘I)", icon: Italic, run: () => wrapInline(api(), "*", "*", "italic") },
    { label: "Link (⌘K)", icon: Link2, run: () => wrapInline(api(), "[", "](https://)", "link text") },
    { label: "Bulleted list", icon: List, run: () => prefixLines(api(), "- ") },
    { label: "Numbered list", icon: ListOrdered, run: () => prefixLines(api(), "", true) },
    { label: "Quote", icon: Quote, run: () => prefixLines(api(), "> ") },
    { label: "Code block", icon: Code, run: () => insertBlock(api(), "```\n\n```\n", 4) },
  ];

  return (
    <div className="relative">
      <div className="mb-1 flex items-center gap-0.5">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.label}
            aria-label={t.label}
            onMouseDown={(e) => {
              e.preventDefault(); // keep the textarea's selection
              t.run();
            }}
            className="rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <t.icon className="size-4" />
          </button>
        ))}
        <span className="ml-2 text-[11px] text-muted-foreground/60">
          type <kbd className="rounded border bg-muted px-1 font-sans">/</kbd> for blocks
        </span>
      </div>

      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          autogrow();
          syncMenu(e.target);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => syncMenu(e.currentTarget)}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        placeholder={placeholder}
        className="w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
      />

      {menu && matches.length > 0 ? (
        <div
          className="absolute z-20 w-64 overflow-hidden rounded-lg border bg-card shadow-lg"
          style={{ top: menu.top, left: Math.min(menu.left, 400) }}
        >
          {matches.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(b);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                i === highlight ? "bg-accent" : "",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">
                <b.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{b.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{b.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
