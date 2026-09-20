"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, MessagesSquare, PanelLeftClose, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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

export function ConversationRail({
  chats,
  activeChatId,
  onOpen,
  onNew,
  onRename,
  onDelete,
  busy = false,
}: {
  chats: AssistantChat[];
  activeChatId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}) {
  const desktop = useDesktopRail();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = useRef(false);
  useLayoutEffect(() => {
    if (restoreToggleFocus.current) {
      toggleRef.current?.focus({ preventScroll: true });
      restoreToggleFocus.current = false;
    }
  }, [collapsed]);

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
    restoreToggleFocus.current = true;
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

  // Keep the compact rail useful: every chat remains directly reachable without
  // expanding the list or losing the current transcript.
  const body = (
    <>
        <Button
          disabled={busy}
          variant="outline"
          size="icon"
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={`Show conversations (${chats.length})`}
          aria-label={`Show conversations (${chats.length})`}
          aria-expanded={false}
        >
          <CollapsedBadge count={chats.length} />
        </Button>
      <div aria-label="Quick conversation access" className="flex min-w-0 gap-1 overflow-x-auto lg:max-h-[60dvh] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
        {chats.map((chat, index) => <Button key={chat.id} disabled={busy} variant="ghost" size="icon" onClick={() => onOpen(chat.id)} title={chat.title} aria-label={`Open ${chat.title}`} aria-current={activeChatId === chat.id ? "true" : undefined} className={cn("shrink-0 tabular-nums", activeChatId === chat.id && "border border-brass-rule bg-secondary text-foreground")}><span aria-hidden="true">{index + 1}</span></Button>)}
      </div>
    </>
  );

  const expandedBody = (
    <>
      <div className="flex items-center gap-2">
        <Button disabled={busy} variant="outline" className="min-w-0 flex-1 justify-start gap-2" onClick={onNew}>
          <Plus className="size-4 shrink-0" /> New chat
        </Button>
        <Button
          ref={toggleRef}
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
            className="h-11 w-full rounded-xl border bg-background pl-8 pr-12 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <Card className="min-h-0 flex-1 rounded-2xl shadow-e1">
        <CardContent className="max-h-[35vh] space-y-3 overflow-y-auto p-2 lg:max-h-[calc(70dvh-4rem)]">
          {chats.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No conversations yet. Ask the assistant something to start one.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
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
                      "group flex flex-wrap items-start gap-1 rounded-xl px-2 py-2 text-sm transition-colors",
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
                          disabled={busy}
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
                        <span className="flex shrink-0 items-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startRename(c)}
                            aria-label={`Rename ${c.title}`}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
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
    <aside aria-label="Assistant conversations" style={desktop ? { width: collapsed ? 52 : 300 } : undefined} className="ui-conversation-rail min-w-0">
      <div className={cn("flex min-w-0 gap-2", collapsed ? "ui-content-enter items-center lg:flex-col" : "ui-panel-enter flex-col")}>
        {collapsed ? body : expandedBody}
      </div>
    </aside>
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
