"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, MessagesSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { AssistantChat } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { groupByDay } from "@/lib/chat-buckets";

/**
 * The conversation list.
 *
 * Three things were wrong with it. Every title was `truncate`d, so a rail whose
 * only job is telling conversations apart showed "Campaign Results An…" for
 * three different chats. It couldn't be put away, so the transcript was stuck at
 * two-thirds width even when you were deep in one conversation. And it was a
 * flat list — fine at three chats, unusable at thirty.
 *
 * So: titles wrap to their full length, the rail collapses (remembered), and
 * once there are enough conversations to lose one there's a filter and
 * day-grouping.
 */

const COLLAPSE_KEY = "rm_assistant_rail_collapsed";
/** Below this the list is short enough to scan; chrome would just be clutter. */
const FILTER_THRESHOLD = 6;

/** Animating a pixel width is only right where the rail is a column. Below lg
 * it's a full-width block above the chat, and pinning it to 288px would break
 * that — so the animation is desktop-only, matched to the Tailwind breakpoint. */
function useDesktopRail(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

/** The same spring the replies panel opens with — one motion vocabulary. */
const EASE_OPEN = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };


export function ConversationRail({
  chats,
  activeChatId,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: {
  chats: AssistantChat[];
  activeChatId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const desktop = useDesktopRail();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Read the remembered state after mount — reading localStorage during render
  // would make the server and client markup disagree.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* private mode — just start expanded */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* nothing to remember it with; the toggle still works this session */
      }
      return next;
    });
  };

  const showFilter = chats.length >= FILTER_THRESHOLD;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  }, [chats, query]);

  // Chats arrive newest-first, so each bucket keeps that order for free.
  const groups = useMemo(
    () => groupByDay(filtered, (c) => c.updated_at).map((g) => ({ label: g.bucket, items: g.items })),
    [filtered],
  );

  const startRename = (c: AssistantChat) => {
    setEditingId(c.id);
    setEditValue(c.title);
  };
  const cancelRename = () => {
    setEditingId(null);
    setEditValue("");
  };
  const commitRename = (id: string) => {
    const next = editValue.trim();
    setEditingId(null);
    if (next) onRename(id, next);
  };

  // The rail is ONE element that changes width, not two that replace each other.
  // mode="wait" made it a two-beat stutter — the old state had to finish leaving
  // before the new one arrived. Same spring the replies panel opens with, so
  // the two read as the same product.
  const body = (
    <>
        <Button
          variant="outline"
          size="icon"
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={`Show conversations (${chats.length})`}
          aria-label={`Show conversations (${chats.length})`}
          aria-expanded={false}
        >
          <CollapsedBadge count={chats.length} />
        </Button>
      <PanelLeftOpen className="size-3.5 text-muted-foreground/60" aria-hidden />
    </>
  );

  const expandedBody = (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="min-w-0 flex-1 justify-start gap-2" onClick={onNew}>
          <Plus className="size-4 shrink-0" /> New chat
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title="Hide conversations"
          aria-label="Hide conversations"
          aria-expanded
          className="shrink-0"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      {showFilter ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${chats.length} conversations`}
            aria-label="Filter conversations"
            className="h-8 w-full rounded-md border bg-background pl-8 pr-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <Card className="min-h-0 flex-1">
        <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto p-2 lg:max-h-[calc(70vh-3rem)]">
          {chats.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No conversations yet. Ask the assistant something to start one.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="space-y-1">
                <p className="px-2 pt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-start gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
                      activeChatId === c.id ? "bg-secondary text-foreground" : "hover:bg-secondary/60",
                    )}
                  >
                    {editingId === c.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <input
                          autoFocus
                          value={editValue}
                          maxLength={120}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitRename(c.id);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => commitRename(c.id)}
                          aria-label="Save title"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          aria-label="Cancel rename"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpen(c.id)}
                          className="min-w-0 flex-1 text-left"
                          aria-current={activeChatId === c.id ? "true" : undefined}
                        >
                          {/* Wraps. The whole point of the rail is telling one
                              conversation from another, and truncation defeated
                              that whenever two started with the same words. */}
                          <span className="block break-words leading-snug">{c.title}</span>
                          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                            {relativeTime(c.updated_at)}
                          </span>
                        </button>
                        {/* Kept mounted rather than conditionally rendered so the
                            row doesn't reflow on hover — and always visible on
                            touch, where there is no hover to reveal them. */}
                        <span className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100 md:opacity-0">
                          <button
                            type="button"
                            onClick={() => startRename(c)}
                            aria-label={`Rename ${c.title}`}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(c.id)}
                            aria-label={`Delete ${c.title}`}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );

  return (
    <motion.aside
      // Width is what actually moves; on small screens the rail is full-width
      // and stacked, so leave it alone there.
      animate={desktop ? { width: collapsed ? 44 : 288 } : { width: "100%" }}
      transition={reduce ? { duration: 0 } : EASE_OPEN}
      className={cn(
        "flex shrink-0 flex-col gap-2 overflow-hidden",
        collapsed ? "items-center" : "min-w-0",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={collapsed ? "collapsed" : "expanded"}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.12 }}
          className={cn("flex min-w-0 flex-col gap-2", collapsed ? "items-center" : "w-full")}
        >
          {collapsed ? body : expandedBody}
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
}

/** The collapsed rail's badge: an icon carrying the conversation count. */
function CollapsedBadge({ count }: { count: number }) {
  return (
    <span className="relative inline-flex">
      <MessagesSquare className="size-4" />
      {count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 grid min-w-3.5 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}
