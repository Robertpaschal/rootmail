"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Headset, Loader2, MessagesSquare, Plus, Send } from "lucide-react";
import {
  listSupportThreads,
  loadSupportThread,
  replySupportThread,
  startSupportThread,
} from "@/app/(app)/support-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import type { SupportTicket } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The HUMAN half of the help chat: real conversations with the rootmail team.
 * Same shape in every mode (floating box, side panel, full page) — a list of
 * past conversations, one open thread, and a composer. Deliberately reads
 * differently from the AI pane (person avatars, "the rootmail team", reply
 * times) so it is never ambiguous who is on the other end.
 *
 * It used to open your most recent conversation and, if that was your ONLY
 * one, offer no way out of it: the way back to the list appeared only at two or
 * more, and the composer always replied to whatever was open. So a customer
 * with a single resolved ticket about an invoice had nowhere to raise an
 * unrelated problem — their only move was to reply to a closed thread about
 * something else. It now carries the same bar the AI pane does (which
 * conversation, all of them, a new one), so both halves of this panel work the
 * same way.
 */

/** Same one-column move as the assistant: the pane BECOMES the list. */
type View = "thread" | "list";

export function SupportPane({
  handoffContext,
  compact = true,
  onSeen,
}: {
  /** Transcript carried over when the user escalates from the assistant. */
  handoffContext?: string;
  /** Tighter spacing for the floating/docked panes; false on the full page. */
  compact?: boolean;
  /** Called when the open thread's newest staff reply has been shown, so the
   * launcher can clear its unread dot. */
  onSeen?: (lastMessageAt: string) => void;
}) {
  const [threads, setThreads] = useState<SupportTicket[] | null>(null);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [view, setView] = useState<View>("thread");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the conversation list once; open the most recent one straight away so
  // an ongoing conversation is never hidden behind a click.
  useEffect(() => {
    startLoad(async () => {
      const res = await listSupportThreads();
      if (res.error) return setError(res.error);
      const list = res.data ?? [];
      setThreads(list);
      if (list.length > 0) {
        const full = await loadSupportThread(list[0].id);
        if (full.ticket) setActive(full.ticket);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    // Reading the thread IS the read receipt — tell the launcher to drop its dot.
    if (active) onSeen?.(active.last_message_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.messages?.length, active?.last_message_at, threads]);

  // While the pane is open, poll the active thread so a staff reply lands without
  // a refresh. 20s is frequent enough to feel live and cheap enough to run all
  // day; the pane only polls while it's actually mounted (i.e. visible).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(async () => {
      const res = await loadSupportThread(active.id);
      if (!res.ticket) return;
      const before = active.messages?.length ?? 0;
      const after = res.ticket.messages?.length ?? 0;
      if (after !== before || res.ticket.status !== active.status) setActive(res.ticket);
    }, 20_000);
    return () => clearInterval(id);
  }, [active]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    startSend(async () => {
      const res = active
        ? await replySupportThread(active.id, text)
        : await startSupportThread(text, handoffContext);
      if (res.error) return setError(res.error);
      if (res.ticket) {
        setActive(res.ticket);
        setThreads((t) => {
          const rest = (t ?? []).filter((x) => x.id !== res.ticket!.id);
          return [res.ticket!, ...rest];
        });
        setDraft("");
      }
    });
  };

  const openThread = (id: string) => {
    setView("thread");
    startLoad(async () => {
      const res = await loadSupportThread(id);
      if (res.error) return setError(res.error);
      if (res.ticket) setActive(res.ticket);
    });
  };

  /** A blank slate. The composer starts a new ticket whenever nothing is open,
   *  so this is just clearing the desk — no round-trip until they write. */
  const newConversation = () => {
    setActive(null);
    setDraft("");
    setError(null);
    setView("thread");
  };

  const pad = compact ? "p-3" : "p-4";
  const resolved = active?.status === "closed";

  const bar = (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <button
        type="button"
        onClick={() => setView("list")}
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Your conversations with the team"
      >
        <MessagesSquare className="size-3.5 shrink-0" />
        <span className="truncate">
          {active ? active.subject || "Conversation with support" : "New conversation"}
        </span>
      </button>
      <button
        type="button"
        onClick={newConversation}
        disabled={!active}
        title="Start a new conversation"
        aria-label="Start a new conversation"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );

  const listView = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => setView("thread")}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">
          {(threads?.length ?? 0) > 0
            ? `${threads!.length} conversation${threads!.length === 1 ? "" : "s"}`
            : "Conversations"}
        </span>
        <button
          type="button"
          onClick={newConversation}
          title="Start a new conversation"
          aria-label="Start a new conversation"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto", compact ? "p-2" : "p-3")}>
        {(threads?.length ?? 0) === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No conversations with the team yet.
          </p>
        ) : (
          threads!.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/60",
                t.id === active?.id && "bg-secondary/40",
              )}
            >
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-witnessed/15 text-witnessed">
                <Headset className="size-3" />
              </span>
              <span className="min-w-0 flex-1">
                {/* Not truncated — the subject is how you tell one problem from
                    another, and support subjects are written by people. */}
                <span className="block break-words text-sm leading-snug">
                  {t.subject || "Conversation with support"}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[12px] font-medium",
                      t.status === "open"
                        ? "bg-witnessed/15 text-witnessed"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.status === "open" ? "Open" : "Resolved"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{relativeTime(t.last_message_at)}</span>
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  if (view === "list") return listView;

  return (
    <>
      {bar}
      <div ref={scrollRef} className={cn("flex-1 space-y-3 overflow-y-auto", pad)}>
        {loading && !active ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : active ? (
          <>
            {/* Whether the team still has this one. The subject moved up into
                the bar — it was being shown twice, a row apart. */}
            <div className="flex items-center justify-end border-b pb-2">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium",
                  active.status === "open"
                    ? "bg-witnessed/15 text-witnessed"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {active.status === "open" ? "Open" : "Resolved"}
              </span>
            </div>

            {(active.messages ?? []).map((m) => {
              const mine = m.author === "customer";
              return (
                <div key={m.id} className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}>
                  {!mine ? (
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-witnessed/15 text-witnessed">
                      <Headset className="size-3" />
                    </span>
                  ) : null}
                  <div className={cn("max-w-[85%]", mine ? "text-right" : "")}>
                    {!mine ? (
                      <p className="mb-0.5 text-[12px] font-medium text-muted-foreground">rootmail team</p>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 text-left text-sm",
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{relativeTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}

            {active.status === "open" && (active.messages ?? []).every((m) => m.author === "customer") ? (
              <p className="text-center text-[12.5px] text-muted-foreground">
                Sent — the team replies here and by email, usually within a business day.
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-11 place-items-center rounded-lg bg-witnessed/15 text-witnessed">
              <Headset className="size-5" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              You&apos;re about to message a <span className="font-medium text-foreground">real person</span> on
              the rootmail team. Tell us what&apos;s going on — we reply here and by email, usually within a
              business day.
            </p>
          </div>
        )}
      </div>

      <div className={cn("border-t", compact ? "p-3" : "p-4")}>
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        {/* The composer stayed fully live on a closed ticket without ever
            saying so, which reads as "the team is still here" when they have
            moved on. Say what writing here does, and offer the other door. */}
        {resolved ? (
          <p className="mb-2 text-[12.5px] text-muted-foreground">
            This one was marked resolved — replying reopens it.{" "}
            <button
              type="button"
              onClick={newConversation}
              className="font-medium text-primary hover:underline"
            >
              Start a new conversation
            </button>{" "}
            if it&apos;s about something else.
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 rounded-lg border bg-background p-1.5 shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
        >
          <Textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={active ? "Write back to the team…" : "Describe what you need help with…"}
            className="max-h-32 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send to support" className="shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
        {/* Support and SALES are different intents — keep the pricing path in
            reach rather than making people file a support ticket about a quote. */}
        <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
          Pricing or a custom plan?{" "}
          <Link href="/contact?topic=sales" className="font-medium text-primary hover:underline">
            Talk to sales
          </Link>
        </p>
      </div>
    </>
  );
}
