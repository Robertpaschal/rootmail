"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Headset, Loader2, Send } from "lucide-react";
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
 */
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
    startLoad(async () => {
      const res = await loadSupportThread(id);
      if (res.error) return setError(res.error);
      if (res.ticket) setActive(res.ticket);
    });
  };

  const pad = compact ? "p-3" : "p-4";

  return (
    <>
      <div ref={scrollRef} className={cn("flex-1 space-y-3 overflow-y-auto", pad)}>
        {loading && !active ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : active ? (
          <>
            {/* Which conversation, and whether the team has it. */}
            <div className="flex items-center gap-2 border-b pb-2">
              {(threads?.length ?? 0) > 1 ? (
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Back to all conversations"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {active.subject || "Conversation with support"}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  active.status === "open"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
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
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Headset className="size-3" />
                    </span>
                  ) : null}
                  <div className={cn("max-w-[85%]", mine ? "text-right" : "")}>
                    {!mine ? (
                      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">rootmail team</p>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 text-left text-sm",
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{relativeTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}

            {active.status === "open" && (active.messages ?? []).every((m) => m.author === "customer") ? (
              <p className="text-center text-[11px] text-muted-foreground">
                Sent — the team replies here and by email, usually within a business day.
              </p>
            ) : null}
          </>
        ) : (threads?.length ?? 0) > 0 ? (
          // The list, when there's more than one conversation to pick from.
          <div className="space-y-1">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Your conversations</p>
            {threads!.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openThread(t.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/60"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Headset className="size-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {t.subject || "Conversation with support"}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {relativeTime(t.last_message_at)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2 rounded-xl border bg-background p-1.5 shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
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
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Pricing or a custom plan?{" "}
          <Link href="/contact?topic=sales" className="font-medium text-primary hover:underline">
            Talk to sales
          </Link>
        </p>
      </div>
    </>
  );
}
