"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, MessagesSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { AssistantChat } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

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

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Today / Yesterday / Previous 7 days / Older — the shape people already read
 * lists of conversations in. */
function bucketOf(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "Older";
  const today = startOfDay(new Date());
  const day = startOfDay(t);
  const diff = Math.round((today - day) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff <= 7) return "Previous 7 days";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

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
  const groups = useMemo(() => {
    const by = new Map<string, AssistantChat[]>();
    for (const c of filtered) {
      const b = bucketOf(c.updated_at);
      const arr = by.get(b);
      if (arr) arr.push(c);
      else by.set(b, [c]);
    }
    return BUCKET_ORDER.filter((b) => by.has(b)).map((b) => ({ label: b, items: by.get(b)! }));
  }, [filtered]);

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

  if (collapsed) {
    return (
      <motion.aside
        initial={reduce ? false : { opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col items-center gap-2"
      >
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
      </motion.aside>
    );
  }

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex w-full min-w-0 flex-col gap-2 lg:w-72"
    >
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
                <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
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
