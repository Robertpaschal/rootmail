"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  CornerUpLeft,
  Inbox,
  Loader2,
  Megaphone,
  Paperclip,
  PenSquare,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";
import { LocalTime } from "@/components/app/local-time";
import { ThreadStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Thread, ThreadMessage, ThreadMessageKind } from "@/lib/types";
import { loadConversations, sendReply, simulateInbound } from "./actions";

// ---------------------------------------------------------------------------
// The Replies inbox as a real email client:
//   contact (left)  →  their subject-threads (right, newest first)  →  each
//   entry a FULL email (headers, rendered HTML body, attachments, lifeline).
// A new subject = a new thread; replies stay on their subject's thread. The
// contact level keeps the relationship in one place so threads never sprawl.
// ---------------------------------------------------------------------------

const KIND: Record<ThreadMessageKind, { label: string; Icon: typeof Megaphone }> = {
  campaign: { label: "Campaign", Icon: Megaphone },
  sequence: { label: "Sequence", Icon: Workflow },
  transactional: { label: "Email", Icon: Send },
  marketing: { label: "Broadcast", Icon: Megaphone },
  sales: { label: "Email", Icon: Send },
  message: { label: "Email", Icon: Send },
  reply: { label: "Reply", Icon: CornerUpLeft },
};

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  queued: "bg-muted text-muted-foreground",
  suppressed: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bounced: "bg-red-500/15 text-red-600 dark:text-red-400",
  complained: "bg-red-500/15 text-red-600 dark:text-red-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function textOf(m: ThreadMessage): string {
  return (m.body_text ?? m.body_html?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ContactGroup {
  email: string;
  name: string | null;
  threads: Thread[]; // newest first
  lastAt: string;
  needsReply: boolean;
  preview: string | null;
}

function groupByContact(threads: Thread[]): ContactGroup[] {
  const byEmail = new Map<string, ContactGroup>();
  for (const t of [...threads].sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1))) {
    const g = byEmail.get(t.contact_email);
    if (!g) {
      byEmail.set(t.contact_email, {
        email: t.contact_email,
        name: t.contact_name,
        threads: [t],
        lastAt: t.last_message_at,
        needsReply: t.status === "needs_reply",
        preview: t.preview,
      });
    } else {
      g.threads.push(t);
      g.name = g.name ?? t.contact_name;
      g.needsReply = g.needsReply || t.status === "needs_reply";
    }
  }
  return [...byEmail.values()];
}

// One entry in a thread, rendered as the full email it is.
function EmailCard({
  m,
  contactName,
  open,
  onToggle,
}: {
  m: ThreadMessage;
  contactName: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const outbound = m.direction === "outbound";
  const meta = KIND[m.kind];
  const sender = outbound
    ? m.from_name
      ? `${m.from_name} <${m.from}>`
      : m.from
    : contactName
      ? `${contactName} <${m.from}>`
      : m.from;
  const snippet = textOf(m);

  return (
    <article className={cn("overflow-hidden rounded-lg border bg-card", !outbound && "border-l-2 border-l-primary")}>
      {/* Email header — who, what, when, and how it's doing out there. */}
      <button type="button" onClick={onToggle} className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-accent/40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", outbound ? "bg-primary/10 text-primary" : "bg-primary/15 text-primary")}>
            <meta.Icon className="size-3" /> {meta.label}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{m.subject ?? "(no subject)"}</span>
          <span className="shrink-0 text-muted-foreground">
            <LocalTime iso={m.created_at} />
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="truncate">
            <span className="text-foreground/70">From</span> {sender}
          </span>
          <span className="truncate">
            <span className="text-foreground/70">To</span> {m.to}
          </span>
        </div>
        {/* The lifeline: this email's own delivery + engagement timeline. */}
        {outbound && (m.status || m.opened_at || m.clicked_at) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {m.status ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_TONE[m.status] ?? "bg-muted text-muted-foreground")}>
                {m.status}
              </span>
            ) : null}
            {m.opened_at ? (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                opened {relativeTime(m.opened_at)}
              </span>
            ) : null}
            {m.clicked_at ? (
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                clicked {relativeTime(m.clicked_at)}
              </span>
            ) : null}
          </div>
        ) : null}
        {!open && snippet ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{snippet}</p> : null}
      </button>

      {/* The email body — the real rendered HTML, framed as the email it is. */}
      {open ? (
        <div className="border-t">
          {m.body_html ? (
            // sandbox="" strips scripts — safe to render the stored HTML as sent.
            <iframe title="Email body" sandbox="" srcDoc={m.body_html} className="h-[420px] w-full bg-white" />
          ) : (
            <div className="whitespace-pre-wrap bg-white px-5 py-4 text-sm leading-relaxed text-neutral-900 dark:bg-card dark:text-foreground">
              {m.body_text ?? "(empty)"}
            </div>
          )}
          {m.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-2.5">
              {m.attachments.map((a) => (
                <span key={a.filename} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
                  <Paperclip className="size-3 text-muted-foreground" />
                  {a.filename}
                  <span className="text-muted-foreground">· {fmtSize(a.size)}</span>
                </span>
              ))}
            </div>
          ) : null}
          <button type="button" onClick={onToggle} className="block w-full border-t px-4 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent/40">
            Collapse email
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function InboxView({
  threads: initialThreads,
  initialDetails,
  initialContact,
}: {
  threads: Thread[];
  initialDetails: Thread[];
  initialContact: string | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [details, setDetails] = useState<Record<string, Thread>>(() =>
    Object.fromEntries(initialDetails.map((t) => [t.id, t])),
  );
  const contacts = useMemo(() => groupByContact(threads), [threads]);

  const [selectedEmail, setSelectedEmail] = useState<string | null>(initialContact ?? contacts[0]?.email ?? null);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [openEmails, setOpenEmails] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const loadedFor = useRef<Set<string>>(new Set());

  const contact = contacts.find((c) => c.email === selectedEmail) ?? null;

  // Default the accordion to the thread that most needs attention.
  useEffect(() => {
    if (!contact) return;
    const current = contact.threads.find((t) => t.id === expandedThread);
    if (current) return;
    const target = contact.threads.find((t) => t.status === "needs_reply") ?? contact.threads[0];
    if (target) {
      setExpandedThread(target.id);
      setDraft("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.email]);

  // Fetch the selected contact's thread details (messages) that we don't have yet.
  useEffect(() => {
    if (!contact || loadedFor.current.has(contact.email)) return;
    const missing = contact.threads.filter((t) => !details[t.id]).map((t) => t.id);
    loadedFor.current.add(contact.email);
    if (missing.length === 0) return;
    startLoad(async () => {
      const loaded = await loadConversations(missing);
      setDetails((d) => ({ ...d, ...Object.fromEntries(loaded.map((t) => [t.id, t])) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.email]);

  // When a thread expands, open its latest email by default.
  useEffect(() => {
    if (!expandedThread) return;
    const det = details[expandedThread];
    const last = det?.messages?.[det.messages.length - 1];
    if (last) setOpenEmails(new Set([last.id]));
  }, [expandedThread, details]);

  const patchThreadRow = (t: Thread, previewText?: string) => {
    setThreads((rows) =>
      rows.map((r) =>
        r.id === t.id
          ? { ...r, status: t.status, last_message_at: t.last_message_at, preview: previewText ?? r.preview }
          : r,
      ),
    );
    setDetails((d) => ({ ...d, [t.id]: t }));
  };

  const reply = () => {
    if (!expandedThread || !draft.trim()) return;
    const text = draft;
    setError(null);
    startSend(async () => {
      const res = await sendReply(expandedThread, text);
      if (res.error) return setError(res.error);
      if (res.thread) {
        patchThreadRow(res.thread, text.slice(0, 140));
        setDraft("");
      }
    });
  };

  const simulate = () => {
    if (!expandedThread) return;
    startSend(async () => {
      const res = await simulateInbound(expandedThread);
      if (res.thread) patchThreadRow(res.thread);
    });
  };

  if (threads.length === 0) {
    return (
      <div className="grid min-h-[50vh] place-items-center rounded-xl border border-dashed">
        <div className="max-w-md space-y-3 p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Inbox className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">No conversations yet</h2>
          <p className="text-sm text-muted-foreground">
            Every email you send opens a thread under its contact — one thread per subject, every reply on the
            thread it answers. Make sure reply capture is on under{" "}
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
      {/* Left: the people you're talking to (their whole relationship in one row). */}
      <aside className={cn("w-full shrink-0 flex-col border-r md:flex md:w-80", showList ? "flex" : "hidden")}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Conversations</p>
          <span className="text-xs text-muted-foreground">{contacts.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {contacts.map((c) => {
            const active = c.email === selectedEmail;
            return (
              <button
                key={c.email}
                onClick={() => {
                  setSelectedEmail(c.email);
                  setShowList(false);
                  setError(null);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
                  active && "bg-accent",
                )}
              >
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(c.name, c.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.name ?? c.email}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(c.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {c.needsReply ? <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Needs reply" /> : null}
                    <span className={cn("truncate text-xs", c.needsReply ? "text-foreground" : "text-muted-foreground")}>
                      {c.preview ?? "No messages yet"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {c.threads.length === 1 ? "1 subject" : `${c.threads.length} subjects`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: the contact's timeline of subject-threads. */}
      <section className={cn("min-w-0 flex-1 flex-col", showList ? "hidden md:flex" : "flex")}>
        {contact ? (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowList(true)} aria-label="Back to list">
                <ArrowLeft className="size-4" />
              </Button>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(contact.name, contact.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{contact.name ?? contact.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {contact.email} · {contact.threads.length === 1 ? "1 subject" : `${contact.threads.length} subjects`}
                </p>
              </div>
              {/* A brand-new subject = a brand-new thread — full composer, prefilled. */}
              <Link
                href={`/messages/new?to=${encodeURIComponent(contact.email)}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <PenSquare className="size-3.5" /> New email
              </Link>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loading && contact.threads.every((t) => !details[t.id]) ? (
                <div className="grid h-40 place-items-center text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                contact.threads.map((t) => {
                  const expanded = t.id === expandedThread;
                  const det = details[t.id];
                  const count = det?.messages?.length;
                  return (
                    <div key={t.id} className={cn("rounded-xl border", expanded && "ring-1 ring-primary/30")}>
                      {/* Thread header: the subject is the conversation. */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedThread(expanded ? null : t.id);
                          setDraft("");
                          setError(null);
                        }}
                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
                      >
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{t.subject || "(no subject)"}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {count != null ? `${count} ${count === 1 ? "email" : "emails"} · ` : ""}
                            {relativeTime(t.last_message_at)}
                          </span>
                        </span>
                        <ThreadStatusBadge status={t.status} />
                      </button>

                      {expanded ? (
                        <div className="space-y-3 border-t px-3 pb-3 pt-3 sm:px-4">
                          {det?.messages ? (
                            det.messages.map((m) => (
                              <EmailCard
                                key={m.id}
                                m={m}
                                contactName={contact.name}
                                open={openEmails.has(m.id)}
                                onToggle={() =>
                                  setOpenEmails((s) => {
                                    const next = new Set(s);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    return next;
                                  })
                                }
                              />
                            ))
                          ) : (
                            <div className="grid h-24 place-items-center text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" />
                            </div>
                          )}

                          {/* Reply composer — scoped to THIS subject-thread. */}
                          <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="mb-2 text-[11px] text-muted-foreground">
                              Replying on <span className="font-medium text-foreground">“{t.subject}”</span> — sends as a real
                              email to {contact.email} and counts toward your plan.
                            </p>
                            {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
                            <div className="flex items-end gap-2">
                              <Textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                    e.preventDefault();
                                    reply();
                                  }
                                }}
                                rows={2}
                                placeholder="Write a quick reply…"
                                className="min-h-0 resize-none bg-background"
                              />
                              <Button onClick={reply} disabled={sending || !draft.trim()} className="shrink-0">
                                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                Reply
                              </Button>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1">
                              <span className="text-[11px] text-muted-foreground">
                                ⌘/Ctrl + Enter · need formatting, a template, or attachments?{" "}
                                <Link
                                  href={`/messages/new?to=${encodeURIComponent(contact.email)}&subject=${encodeURIComponent(`Re: ${t.subject}`)}`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  Open the full editor
                                </Link>{" "}
                                — it lands on this thread.
                              </span>
                              <button
                                onClick={simulate}
                                disabled={sending}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <Sparkles className="size-3" /> Simulate a reply
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Pick a conversation to open it.</div>
        )}
      </section>
    </div>
  );
}
