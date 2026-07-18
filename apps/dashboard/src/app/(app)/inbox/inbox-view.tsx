"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Inbox, Loader2, Megaphone, Send, Sparkles, Workflow } from "lucide-react";
import { LocalTime } from "@/components/app/local-time";
import { ThreadStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Thread, ThreadMessage, ThreadMessageKind } from "@/lib/types";
import { loadConversation, sendReply, simulateInbound } from "./actions";

// A plain-English label for where an outbound message came from.
const KIND: Record<ThreadMessageKind, { label: string; Icon: typeof Megaphone } | null> = {
  campaign: { label: "Campaign", Icon: Megaphone },
  sequence: { label: "Sequence", Icon: Workflow },
  transactional: { label: "Email", Icon: Send },
  marketing: { label: "Broadcast", Icon: Megaphone },
  sales: { label: "Email", Icon: Send },
  message: { label: "Email", Icon: Send },
  reply: null,
};

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function bodyText(m: ThreadMessage): string {
  return (m.body_text ?? m.body_html?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim();
}

function Bubble({ m, contactName }: { m: ThreadMessage; contactName: string | null }) {
  const outbound = m.direction === "outbound";
  const src = KIND[m.kind];
  return (
    <div className={cn("flex flex-col gap-1", outbound ? "items-end" : "items-start")}>
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        {outbound ? (
          src ? (
            <>
              <src.Icon className="size-3" />
              <span className="font-medium text-foreground/70">{src.label}</span>
              {m.subject ? <span className="max-w-[220px] truncate">· {m.subject}</span> : null}
            </>
          ) : (
            <span className="font-medium text-foreground/70">You</span>
          )
        ) : (
          <span className="font-medium text-foreground/70">{contactName ?? "They"}</span>
        )}
        <span>·</span>
        <LocalTime iso={m.created_at} />
      </div>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl border px-3.5 py-2 text-sm leading-relaxed sm:max-w-[75%]",
          outbound ? "rounded-br-md bg-primary/10" : "rounded-bl-md bg-muted/60",
        )}
      >
        {bodyText(m) || <span className="text-muted-foreground">(no text)</span>}
      </div>
    </div>
  );
}

export function InboxView({ threads, initialConversation }: { threads: Thread[]; initialConversation: Thread | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initialConversation?.id ?? null);
  const [convo, setConvo] = useState<Thread | null>(initialConversation);
  const [loading, startLoad] = useTransition();
  const [showList, setShowList] = useState(true); // mobile: list vs conversation
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [convo?.id, convo?.messages?.length]);

  const select = (id: string) => {
    setSelectedId(id);
    setShowList(false);
    setError(null);
    if (id === convo?.id) return;
    startLoad(async () => {
      const t = await loadConversation(id);
      setConvo(t);
    });
  };

  const send = () => {
    if (!convo || !draft.trim()) return;
    setError(null);
    const text = draft;
    startSend(async () => {
      const res = await sendReply(convo.id, text);
      if (res.error) return setError(res.error);
      if (res.thread) setConvo(res.thread);
      setDraft("");
    });
  };

  const simulate = () => {
    if (!convo) return;
    startSend(async () => {
      const res = await simulateInbound(convo.id);
      if (res.thread) setConvo(res.thread);
    });
  };

  // The address a reply goes out as (the conversation's original sender).
  const replyFrom = [...(convo?.messages ?? [])].reverse().find((m) => m.direction === "outbound")?.from ?? null;

  if (threads.length === 0) {
    return (
      <div className="grid min-h-[50vh] place-items-center rounded-xl border border-dashed">
        <div className="max-w-md space-y-3 p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Inbox className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">No conversations yet</h2>
          <p className="text-sm text-muted-foreground">
            Every email you send opens a space here. When someone replies, it lands in their conversation — one thread per
            person, like a chat. Make sure reply capture is on under{" "}
            <a href="/settings/sender" className="font-medium text-primary hover:underline">
              Settings → Sending
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border bg-card">
      {/* Left: the people you're talking to */}
      <aside className={cn("w-full shrink-0 flex-col border-r md:flex md:w-80", showList ? "flex" : "hidden")}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Conversations</p>
          <span className="text-xs text-muted-foreground">{threads.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((t) => {
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => select(t.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
                  active && "bg-accent",
                )}
              >
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(t.contact_name, t.contact_email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.contact_name ?? t.contact_email}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(t.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {t.status === "needs_reply" ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Needs reply" />
                    ) : null}
                    <span className={cn("truncate text-xs", t.status === "needs_reply" ? "text-foreground" : "text-muted-foreground")}>
                      {t.preview ?? "No messages yet"}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: the conversation */}
      <section className={cn("min-w-0 flex-1 flex-col", showList ? "hidden md:flex" : "flex")}>
        {convo ? (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowList(true)} aria-label="Back to list">
                <ArrowLeft className="size-4" />
              </Button>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(convo.contact_name, convo.contact_email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{convo.contact_name ?? convo.contact_email}</p>
                {convo.contact_name ? <p className="truncate text-xs text-muted-foreground">{convo.contact_email}</p> : null}
              </div>
              <ThreadStatusBadge status={convo.status} />
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
              {loading && convo.messages == null ? (
                <div className="grid h-full place-items-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                (convo.messages ?? []).map((m) => <Bubble key={m.id} m={m} contactName={convo.contact_name} />)
              )}
            </div>

            <div className="border-t p-3">
              {error ? <p className="mb-2 px-1 text-sm text-destructive">{error}</p> : null}
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder={replyFrom ? `Reply as ${replyFrom}…` : "Write a reply…"}
                  className="min-h-0 resize-none"
                />
                <Button onClick={send} disabled={sending || !draft.trim()} className="shrink-0">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send
                </Button>
              </div>
              <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
                <button onClick={simulate} disabled={sending} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <Sparkles className="size-3" /> Simulate a reply (for testing)
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Pick a conversation to open it.</div>
        )}
      </section>
    </div>
  );
}
