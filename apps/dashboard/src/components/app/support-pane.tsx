"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Headset, Loader2, MessagesSquare, Plus, RefreshCw, Send } from "lucide-react";
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
import { SegmentedControl } from "./segmented-control";
import { filterSupportThreads } from "@/lib/support-view";

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
  visible = true,
}: {
  /** Transcript carried over when the user escalates from the assistant. */
  handoffContext?: string;
  /** Tighter spacing for the floating/docked panes; false on the full page. */
  compact?: boolean;
  /** Called when the open thread's newest staff reply has been shown, so the
   * launcher can clear its unread dot. */
  onSeen?: (lastMessageAt: string) => void;
  visible?: boolean;
}) {
  const [threads, setThreads] = useState<SupportTicket[] | null>(null);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [view, setView] = useState<View>("thread");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = active?.id ?? "new";
  const draft = drafts[draftKey] ?? "";
  const setDraft = (value: string) => setDrafts((previous) => ({ ...previous, [draftKey]: value }));
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the conversation list once; open the most recent one straight away so
  // an ongoing conversation is never hidden behind a click.
  useEffect(() => {
    let alive = true;
    startLoad(async () => {
      const res = await listSupportThreads();
      if (!alive) return;
      if (res.error) return setError(res.error);
      const list = res.data ?? [];
      setThreads(list);
      if (list.length > 0) {
        const full = await loadSupportThread(list[0].id);
        if (!alive) return;
        if (full.ticket) setActive(full.ticket);
        else setError(full.error ?? "Couldn't open your conversation. Choose it from the conversation list to retry.");
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible || view !== "thread" || loading) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // Reading the thread IS the read receipt — tell the launcher to drop its dot.
    if (active) onSeen?.(active.last_message_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.messages?.length, active?.last_message_at, visible, view, loading]);

  // While the pane is open, poll the active thread so a staff reply lands without
  // a refresh. 20s is frequent enough to feel live and cheap enough to run all
  // day; the pane only polls while it's actually mounted (i.e. visible).
  useEffect(() => {
    if (!active || !visible || view !== "thread" || sending || loading) return;
    let alive = true;
    const id = setInterval(async () => {
      const res = await loadSupportThread(active.id);
      if (!alive || !res.ticket) return;
      const before = active.messages?.length ?? 0;
      const after = res.ticket.messages?.length ?? 0;
      if (after !== before || res.ticket.status !== active.status) {
        setActive(res.ticket);
        setThreads((previous) => previous?.map((ticket) => ticket.id === res.ticket!.id ? res.ticket! : ticket) ?? null);
      }
    }, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, [active, visible, view, sending, loading]);

  const send = () => {
    const text = draft.trim();
    if (!text || sending || loading || threads === null) return;
    setError(null);
    startSend(async () => {
      const res = active
        ? await replySupportThread(active.id, text)
        : await startSupportThread(text, handoffContext, subject);
      if (res.error) return setError(res.error);
      if (res.ticket) {
        setActive(res.ticket);
        setThreads((t) => {
          const rest = (t ?? []).filter((x) => x.id !== res.ticket!.id);
          return [res.ticket!, ...rest];
        });
        setDraft("");
        if (!active) setSubject("");
      }
    });
  };

  const openThread = (id: string) => {
    if (loading || sending) return;
    setView("thread");
    setError(null);
    startLoad(async () => {
      const res = await loadSupportThread(id);
      if (res.error) { setView("list"); return setError(res.error); }
      if (res.ticket) setActive(res.ticket);
    });
  };

  const showThreads = () => {
    if (loading || sending) return;
    setView("list");
    setError(null);
    startLoad(async () => {
      const res = await listSupportThreads();
      if (res.error) setError(res.error);
      else setThreads(res.data ?? []);
    });
  };

  /** A blank slate. The composer starts a new ticket whenever nothing is open,
   *  so this is just clearing the desk — no round-trip until they write. */
  const newConversation = () => {
    if (loading || sending) return;
    setActive(null);
    setError(null);
    setView("thread");
  };

  const pad = compact ? "p-4" : "p-4 sm:px-6";
  const resolved = active?.status === "closed";
  const matchingThreads = filterSupportThreads(threads ?? [], filter, query);

  const bar = (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <button
        type="button"
        onClick={showThreads}
        disabled={loading || sending}
        className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Your conversations with the team"
        aria-label="All support conversations"
      >
        <MessagesSquare className="size-3.5 shrink-0" />
        <span className="truncate">
          Conversations{threads ? ` (${threads.length})` : ""}
        </span>
      </button>
      <button
        type="button"
        onClick={newConversation}
        disabled={loading || sending}
        title="Start a new conversation"
        aria-label="Start a new conversation"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <span className="inline-flex items-center gap-1 px-1"><Plus className="size-3.5" /> New</span>
      </button>
    </div>
  );

  const listView = (
    <div className="ui-panel-enter flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => setView("thread")}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
          {(threads?.length ?? 0) > 0
            ? `${threads!.length} conversation${threads!.length === 1 ? "" : "s"}`
            : "Conversations"}
        </span>
        <button type="button" onClick={showThreads} disabled={loading || sending} aria-label="Refresh support conversations" className="rounded-lg px-2 text-muted-foreground hover:bg-secondary"><RefreshCw className={cn("size-4", loading && "animate-spin")} /></button>
        <button
          type="button"
          onClick={newConversation}
          disabled={loading || sending}
          title="Start a new conversation"
          aria-label="Start a new conversation"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="inline-flex items-center gap-1 px-1"><Plus className="size-3.5" /> New</span>
        </button>
      </div>
      <div className="space-y-2 border-b p-3">
        <input aria-label="Search support conversations" placeholder="Search conversations…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-xl border bg-background px-3 py-2" />
        <SegmentedControl label="Support conversation status" value={filter} onChange={setFilter} options={[
          { value: "all", label: `All (${threads?.length ?? 0})` },
          { value: "open", label: `Open (${threads?.filter((t) => t.status === "open").length ?? 0})` },
          { value: "closed", label: `Resolved (${threads?.filter((t) => t.status === "closed").length ?? 0})` },
        ]} />
        <p className="text-xs text-muted-foreground">The team marks threads resolved. Replying to a resolved thread reopens it.</p>
      </div>
      <div className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto", compact ? "p-2" : "p-3")}>
        {matchingThreads.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {loading ? "Loading conversations…" : threads?.length ? "No conversations match this search or status." : "No conversations with the team yet. Start a new conversation above."}
          </p>
        ) : (
          matchingThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              disabled={loading || sending}
              aria-current={t.id === active?.id ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/60",
                t.id === active?.id && "bg-secondary/40",
              )}
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground">
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
                        ? "bg-witnessed-tint text-witnessed"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.status === "open" ? "Open" : "Resolved"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{relativeTime(t.last_message_at)}</span>
                  {drafts[t.id]?.trim() ? <span className="text-xs text-brass-text">Draft</span> : null}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const errorNotice = error ? <p role="alert" className="mx-4 my-2 text-sm text-destructive">{error}</p> : null;
  if (view === "list") return <div className="help-surface flex min-h-0 flex-1 flex-col">{errorNotice}{listView}</div>;

  return (
    <div className="help-surface ui-content-enter flex min-h-0 flex-1 flex-col">
      {bar}
      {errorNotice}
      <div ref={scrollRef} className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", pad)}>
        {loading ? (
          <div className="grid h-24 place-items-center">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Opening conversation…</p>
          </div>
        ) : active ? (
          <>
            {/* Whether the team still has this one. The subject moved up into
                the bar — it was being shown twice, a row apart. */}
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold">{active.subject || "Conversation with support"}</h2><p className="mt-1 text-sm text-muted-foreground">{resolved ? "Marked resolved by the team. Reply below to reopen this issue." : "Open with the Rootmail team. Replies appear here and by email."}</p></div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium",
                  active.status === "open"
                    ? "bg-witnessed-tint text-witnessed"
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
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-witnessed-tint text-witnessed">
                      <Headset className="size-3" />
                    </span>
                  ) : null}
                  <div className={cn("min-w-0 max-w-[90%]", mine ? "text-right" : "")}>
                    <p className="mb-1 text-sm font-semibold text-muted-foreground">{mine ? "You" : "Rootmail team"}</p>
                    <div
                      className={cn(
                        "help-message rounded-2xl border px-4 py-3 text-left text-base",
                        mine ? "border-brass-rule bg-brass-tint text-foreground" : "bg-background",
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
          <div className="flex min-h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="grid size-12 place-items-center rounded-2xl border border-brass-rule bg-brass-tint text-brass-text">
              <Headset className="size-5" />
            </span>
            <h2 className="text-xl font-semibold">Talk to the Rootmail team</h2>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground">
              A real person, not the AI assistant. Tell us what happened and what you need help with. Replies arrive here and by email.
            </p>
          </div>
        )}
      </div>

      <div className={cn("shrink-0 border-t", compact ? "p-3" : "p-4")}>
        {!active ? <label className="mb-3 block text-sm font-medium">Topic <span className="font-normal text-muted-foreground">(optional)</span><input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={loading || sending} maxLength={200} placeholder="For example, help with sender verification" className="mt-1 w-full rounded-xl border bg-background px-3 py-2" /></label> : null}
        {!active && handoffContext ? <p className="mb-3 text-sm text-muted-foreground">Your recent assistant messages will be included for context.</p> : null}
        {/* The composer stayed fully live on a closed ticket without ever
            saying so, which reads as "the team is still here" when they have
            moved on. Say what writing here does, and offer the other door. */}
        {resolved ? (
          <p className="mb-2 text-[12.5px] text-muted-foreground">
            This one was marked resolved — replying reopens it.{" "}
            <button
              type="button"
              onClick={newConversation}
              className="font-medium text-brass-text hover:underline"
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
            aria-label="Message the support team"
            disabled={loading || sending || threads === null}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={active ? "Message the team…" : "How can we help?"}
            className="max-h-32 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={sending || loading || threads === null || !draft.trim()} aria-label="Send to support" className="shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
        {/* Support and SALES are different intents — keep the pricing path in
            reach rather than making people file a support ticket about a quote. */}
        <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
          Pricing or a custom plan?{" "}
          <Link href="/contact?topic=sales" className="font-medium text-brass-text hover:underline">
            Talk to sales
          </Link>
        </p>
      </div>
    </div>
  );
}
