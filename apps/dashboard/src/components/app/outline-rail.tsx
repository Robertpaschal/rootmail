"use client";

import { type RefObject, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A table of contents for something you scroll through.
 *
 * A stack of short horizontal ticks pinned to the pane's edge — one per section,
 * the current one wider and brighter. Hovering or clicking expands it into
 * labels; clicking a label jumps there. Notion's outline, and the same idea a
 * long chat needs: once a conversation runs past a screen or two, the only way
 * back to "that thing about pricing" is scrolling and hoping.
 *
 * Shared because the shape recurs — a long assistant chat and a contact with
 * several email threads are the same navigation problem. Each caller decides
 * what a "section" is; this only knows how to list them and scroll to one.
 *
 * Deliberately quiet: it hides below `minSections` (a three-turn chat doesn't
 * need a map), sits at low opacity until approached, and never takes layout —
 * so it can't push the content it's describing.
 */

export interface OutlineSection {
  /** The DOM id to scroll to. The caller must render it. */
  id: string;
  label: string;
  /** Optional second line — a timestamp, a count. */
  meta?: string;
}

export function OutlineRail({
  sections,
  containerRef,
  activeId,
  onSelect,
  minSections = 3,
  label = "Jump to",
  className,
}: {
  sections: OutlineSection[];
  containerRef: RefObject<HTMLElement | null>;
  /** Highlighted tick — the caller knows what's "current" better than we do. */
  activeId?: string | null;
  /**
   * Run when a section is picked, before scrolling to it.
   *
   * Scrolling alone is the wrong verb where a section is something you OPEN.
   * In Replies the threads are collapsible and only one is expanded at a time,
   * so gliding past a closed thread to leave a different one open is a
   * non-answer: you asked to go to that conversation, so it should become the
   * conversation you're in. Callers whose sections are always visible (the
   * assistant's turns) leave this off and get a plain jump.
   */
  onSelect?: (id: string) => void;
  minSections?: number;
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (sections.length < minSections) return null;

  const jump = (id: string) => {
    setOpen(false);
    // onSelect means the caller owns arriving. It knows things this doesn't —
    // that the section has to load, that the useful spot is the bottom of it
    // rather than the top — and it can wait for them. Scrolling here as well
    // would only fight it.
    if (onSelect) {
      onSelect(id);
      return;
    }
    const el = containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div
      className={cn(
        // The rail gets its OWN COLUMN — it takes layout instead of floating
        // over the content. Absolutely positioning it meant the ticks sat on
        // top of whatever was underneath (email bodies, answer text), and the
        // taller the list grew the more of the content it crossed. A list that
        // grows with the user's data needs a lane of its own.
        //
        // Because it takes layout, the column exists exactly when the rail does
        // — below `minSections` this returns null and no empty gutter is left
        // behind. Callers put it in a flex row next to their scroller.
        //
        // Vertically centred, not tucked in the top corner: that corner is
        // where headers live, and the two used to fight over the same pixels.
        // It's also where a reader's eye already is.
        "relative z-30 flex w-9 shrink-0 flex-col items-center justify-center",
        className,
      )}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}
    >
      <button
        ref={trigger}
        type="button"
        // Hover may already have opened it before the click arrives. A pointer
        // click must not immediately undo that opening; keyboard can toggle.
        onClick={(event) => setOpen((value) => event.detail === 0 ? !value : true)}
        aria-label={`${label} (${sections.length} sections)`}
        aria-expanded={open}
        className={cn(
          "mb-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          open && "bg-secondary text-foreground",
        )}
      >
        <List className="size-3.5" />
      </button>

      {/*
        The panel is ABSOLUTELY positioned and the ticks stay mounted (just
        faded) so this container never changes size.

        Swapping one for the other resized the hover target under the cursor:
        the pointer fell outside, mouseleave fired, it closed, the ticks came
        back under the cursor, mouseenter fired — open, close, open. That was
        the shake. Nothing moves now, so there's nothing to oscillate.

        The panel is a descendant, so hovering it still counts as inside and
        keeps it open.
      */}
      <div
        aria-hidden={open}
        className={cn("flex flex-col items-center gap-1", open ? "invisible" : "visible")}
      >
        {sections.map((s) => (
          <span
            key={s.id}
            className={cn(
              "h-0.5 rounded-full transition-all",
              s.id === activeId ? "w-4 bg-primary" : "w-2.5 bg-muted-foreground/50",
            )}
          />
        ))}
      </div>

        {open ? (
          <nav
            key="labels"
            aria-label={label}
            // right-full: opens to the LEFT of the gutter, over the content.
            // A popover may cover things — it's transient and you asked for it.
            // The ticks, which are always there, are what must not.
            className="ui-scene-enter absolute right-full top-1/2 mr-1 max-h-[70vh] w-56 max-w-[calc(100vw-6rem)] -translate-y-1/2 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
          >
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  s.id === activeId && "bg-accent/60 font-medium",
                )}
              >
                <span className="block truncate">{s.label}</span>
                {s.meta ? (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{s.meta}</span>
                ) : null}
              </button>
            ))}
          </nav>
        ) : null}
    </div>
  );
}
