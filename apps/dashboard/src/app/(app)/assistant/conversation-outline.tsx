"use client";

import { type RefObject, useState } from "react";
import { List } from "lucide-react";
import type { AssistantChatMessage } from "./actions";
import { cn } from "@/lib/utils";

// In-chat navigation. Each USER prompt is a "section" of the conversation; this
// renders them as a stack of horizontal ticks pinned to the transcript's edge
// that expand — on hover or click — into a labelled outline. Clicking a section
// scrolls to that turn. Only shown once a chat has several turns, so short
// conversations stay uncluttered.

const MIN_SECTIONS = 3;

function label(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

export function ConversationOutline({
  messages,
  containerRef,
}: {
  messages: AssistantChatMessage[];
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [pinned, setPinned] = useState(false);

  const sections = messages.filter((m) => m.role === "user");
  if (sections.length < MIN_SECTIONS) return null;

  const jump = (id: string) => {
    const container = containerRef.current;
    const el = container?.querySelector<HTMLElement>(`#turn-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="group/outline absolute right-1 top-1 z-10"
      onMouseEnter={() => setPinned(false)}
    >
      {/* Collapsed: a toggle + a column of ticks, one per prompt. */}
      <button
        type="button"
        aria-label={pinned ? "Hide conversation outline" : "Show conversation outline"}
        aria-expanded={pinned}
        onClick={() => setPinned((p) => !p)}
        className="ml-auto flex items-center gap-1 rounded-md border bg-background/80 px-1.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
      >
        <List className="size-3.5" />
        <span className="hidden sm:inline">Outline</span>
      </button>

      <div
        className={cn(
          "mt-1 flex flex-col items-end gap-1.5 transition-opacity",
          pinned ? "opacity-0" : "opacity-100 group-hover/outline:opacity-0",
        )}
        aria-hidden
      >
        {sections.map((s) => (
          <span key={s.id} className="block h-0.5 w-4 rounded-full bg-border" />
        ))}
      </div>

      {/* Expanded: the labelled outline. Visible on hover, or pinned by click. */}
      <nav
        className={cn(
          "absolute right-0 top-8 w-56 rounded-md border bg-popover p-1 text-sm shadow-md transition-opacity",
          pinned ? "opacity-100" : "pointer-events-none opacity-0 group-hover/outline:pointer-events-auto group-hover/outline:opacity-100",
        )}
      >
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          In this chat
        </p>
        <ol className="max-h-[40vh] space-y-0.5 overflow-y-auto">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => jump(s.id)}
                className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <span className="mt-0.5 w-4 shrink-0 text-right tabular-nums opacity-60">{i + 1}</span>
                <span className="line-clamp-2">{label(s.content)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
