"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CornerUpLeft,
  Inbox,
  Loader2,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  PenSquare,
  Search,
  Send,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { OutlineRail } from "@/components/app/outline-rail";
import { InfoHint } from "@/components/app/info-hint";
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

// The internal type distinction, made legible: bulk kinds (Campaign / Sequence /
// Broadcast) are marketing sends; "One-to-one" is transactional — the moment a
// conversation turns personal it can't be unsubscribed from and meters against
// sends, not marketing volume. The user never has to CHOOSE this; we just show it.
const KIND: Record<ThreadMessageKind, { label: string; Icon: typeof Megaphone }> = {
  campaign: { label: "Campaign", Icon: Megaphone },
  sequence: { label: "Sequence", Icon: Workflow },
  transactional: { label: "One-to-one", Icon: Send },
  marketing: { label: "Broadcast", Icon: Megaphone },
  sales: { label: "One-to-one", Icon: Send },
  message: { label: "One-to-one", Icon: Send },
  reply: { label: "Their reply", Icon: CornerUpLeft },
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

const RAIL_KEY = "rm_inbox_rail_open";

/** One easing for every unfold on this page, so it all feels like one hand. */
const EASE_OPEN = { type: "spring" as const, stiffness: 380, damping: 34, mass: 0.7 };

/**
 * Collapsing the people rail is a desktop idea — on mobile the list is its own
 * full screen. We only need this to keep a zero-width rail out of the tab order.
 */
function useDesktop(): boolean {
  const [is, setIs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return is;
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
  const reduce = useReducedMotion();
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
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={reduce ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className={cn("overflow-hidden rounded-lg border bg-card", !outbound && "border-l-2 border-l-primary")}
    >
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

      {/* The email body — the real rendered HTML, framed as the email it is.
          It unfolds: a mail client that snaps open loses your place. */}
      <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="body"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { height: EASE_OPEN, opacity: { duration: 0.16 } }}
          className="overflow-hidden border-t">
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
        </motion.div>
      ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export function InboxView({
  threads: initialThreads,
  initialDetails,
  initialContact,
  sandbox = false,
}: {
  threads: Thread[];
  initialDetails: Thread[];
  initialContact: string | null;
  /** Sandbox workspaces get demo tools (simulate a reply); live stays truly live. */
  sandbox?: boolean;
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
  // The people rail folds to a strip of avatars so ONE conversation can have the
  // whole width — reading a long exchange shouldn't cost you 320px of names you
  // aren't looking at. Collapsed still lets you switch person in one click.
  const [railOpen, setRailOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyNeedsReply, setOnlyNeedsReply] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const loadedFor = useRef<Set<string>>(new Set());
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const reduce = useReducedMotion();
  const threadPaneRef = useRef<HTMLDivElement>(null);
  /** Set when a thread is opened FROM the outline — the signal to land at the
   * reply box once its emails have loaded, rather than at the top. */
  const landAtReplyFor = useRef<string | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktop = useDesktop();
  // Switching person should animate; ARRIVING at the page should not — the first
  // conversation is just what's there. (Keying on the contact remounts those
  // subtrees, so their `initial` would otherwise replay on every page load.)
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);
  const switching = !firstPaint.current && !reduce;

  useEffect(() => {
    const stored = window.localStorage.getItem(RAIL_KEY);
    if (stored != null) setRailOpen(stored === "1");
  }, []);
  const toggleRail = (next: boolean) => {
    setRailOpen(next);
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
  };

  const contact = contacts.find((c) => c.email === selectedEmail) ?? null;
  const needsReplyCount = contacts.filter((c) => c.needsReply).length;

  // Finding a person shouldn't mean scrolling. Name, address, and what they last
  // said are all fair game — you remember conversations by any of the three.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (onlyNeedsReply && !c.needsReply) return false;
      if (!q) return true;
      return (
        c.email.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.preview ?? "").toLowerCase().includes(q) ||
        c.threads.some((t) => t.subject.toLowerCase().includes(q))
      );
    });
  }, [contacts, query, onlyNeedsReply]);

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

  /**
   * Arriving from the outline, land where the work is.
   *
   * The top of a thread is its oldest email — the least useful thing in it. You
   * came to this conversation to read the newest message and answer it, so put
   * the reply box on screen. It waits for `details` because the emails load
   * after the expand, and scrolling before they arrive aims at a box that isn't
   * there yet.
   */
  useEffect(() => {
    const tid = landAtReplyFor.current;
    if (!tid || tid !== expandedThread || !details[tid] || landTimer.current) return;
    // Two things move the composer AFTER this effect first fires: the thread
    // body springs open from height 0, and the sibling effect above expands the
    // latest email inside it. Scrolling immediately aims at where the composer
    // is now and lands nowhere once those settle. So wait for the layout to
    // stop moving, then go.
    //
    // The pending scroll deliberately survives re-renders. `details` is in the
    // dep list and changes while the thread loads, so a cleanup that cleared
    // this timer cancelled the scroll every time — the first pass had already
    // consumed the ref, so nothing rescheduled it and the pane just sat at the
    // top. The flag is cleared when the scroll actually happens, not before.
    landTimer.current = setTimeout(() => {
      landTimer.current = null;
      landAtReplyFor.current = null;
      const pane = threadPaneRef.current;
      const el = pane?.querySelector<HTMLElement>(`#reply-${CSS.escape(tid)}`);
      if (!pane || !el) return;
      // Move THIS pane, by measurement. scrollIntoView picks a scrollable
      // ancestor itself and here it kept choosing something other than the
      // thread pane — the call fired on the right element and the pane stayed
      // at 0 with 201px of scroll going spare. Rects don't guess.
      const delta = el.getBoundingClientRect().bottom - pane.getBoundingClientRect().bottom + 16;
      if (delta > 0) {
        pane.scrollTo({ top: pane.scrollTop + delta, behavior: reduce ? "auto" : "smooth" });
      }
    }, reduce ? 0 : 380);
  }, [expandedThread, details, reduce]);

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
        // The sent email slides into the thread on its own; this is just the
        // button confirming it heard you, then quietly going back to normal.
        setJustSent(true);
        setTimeout(() => setJustSent(false), 1800);
      }
    });
  };

  // The composer grows with what you're writing — a two-row box that never
  // grows is the reason people leave the inbox for the full editor.
  const growComposer = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };
  useEffect(() => {
    if (!draft) {
      const el = composerRef.current;
      if (el) el.style.height = "";
      return;
    }
    growComposer(composerRef.current);
  }, [draft]);

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
      {/* Collapsed: a strip of faces. Switching person stays one click away even
          when the conversation has the width. */}
      <AnimatePresence initial={false}>
        {!railOpen ? (
          <motion.aside
            key="rail-strip"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 56, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { width: EASE_OPEN, opacity: { duration: 0.15 } }}
            className="hidden shrink-0 overflow-hidden border-r md:block"
          >
            <div className="flex h-full w-14 flex-col items-center gap-1 py-3">
              <button
                type="button"
                onClick={() => toggleRail(true)}
                title="Show conversations"
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelLeftOpen className="size-4" />
              </button>
              <span className="my-1 h-px w-6 bg-border" />
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {contacts.map((c, i) => (
                  <motion.button
                    key={c.email}
                    initial={reduce ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={reduce ? { duration: 0 } : { delay: Math.min(i, 8) * 0.02, duration: 0.2 }}
                    whileHover={reduce ? undefined : { scale: 1.08 }}
                    whileTap={reduce ? undefined : { scale: 0.94 }}
                    onClick={() => {
                      setSelectedEmail(c.email);
                      setError(null);
                    }}
                    title={`${c.name ?? c.email}${c.needsReply ? " · needs reply" : ""}`}
                    className={cn(
                      "relative grid size-9 place-items-center rounded-full text-xs font-semibold transition-colors",
                      c.email === selectedEmail
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/20",
                    )}
                  >
                    {initials(c.name, c.email)}
                    {c.needsReply ? (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-amber-500" />
                    ) : null}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      {/* Left: the people you're talking to (their whole relationship in one row). */}
      <aside
        // The width is the animation: 20rem → 0. A CSS transition rather than a
        // spring, because this one value has to be breakpoint-aware (full width
        // on mobile, where the rail doesn't collapse at all) and that is exactly
        // what CSS does and inline motion styles can't.
        inert={desktop && !railOpen}
        className={cn(
          // overflow-hidden both clips the fixed-width content inside and zeroes
          // this flex item's automatic minimum size; min-w-0 says so explicitly,
          // so the rail still reaches 0 if that overflow ever changes.
          "w-full shrink-0 flex-col md:w-[var(--rm-rail-w)] md:min-w-0 md:overflow-hidden md:transition-[width] md:duration-300 md:ease-out motion-reduce:transition-none",
          showList ? "flex" : "hidden",
          "md:flex",
          railOpen && "border-r",
        )}
        style={{ "--rm-rail-w": railOpen ? "20rem" : "0px" } as React.CSSProperties}
      >
        <div className="flex h-full w-full min-w-0 flex-col md:w-80">
        <div className="space-y-2.5 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              Conversations <span className="font-normal text-muted-foreground">{contacts.length}</span>
            </p>
            <button
              type="button"
              onClick={() => toggleRail(false)}
              title="Collapse — give the conversation the full width"
              className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:block"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people or subjects"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* The only filter worth a permanent control: who is waiting on you.
              The selected pill travels between the two rather than blinking. */}
          <LayoutGroup id="inbox-filter">
            <div className="flex gap-1">
              {([
                { id: false, label: "All", n: contacts.length },
                { id: true, label: "Needs reply", n: needsReplyCount },
              ] as const).map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setOnlyNeedsReply(f.id)}
                  className={cn(
                    "relative rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                    onlyNeedsReply === f.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {onlyNeedsReply === f.id ? (
                    <motion.span
                      layoutId="inbox-filter-pill"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                      className="absolute inset-0 rounded-full border border-primary bg-primary/10"
                    />
                  ) : null}
                  <span className="relative">
                    {f.label} {f.n > 0 ? <span className="opacity-70">{f.n}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </div>
        {/* relative: popLayout takes a filtered-out row out of flow so the rows
            below close the gap immediately instead of waiting for it to finish. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence initial={false}>
            {visible.length === 0 ? (
              <motion.p
                key="rail-empty"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
                className="px-4 py-6 text-center text-sm text-muted-foreground"
              >
                {onlyNeedsReply ? "Nobody is waiting on you." : "No one matches that."}
              </motion.p>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="popLayout">
          {visible.map((c) => {
            const active = c.email === selectedEmail;
            return (
              <motion.button
                key={c.email}
                layout={reduce ? false : "position"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={reduce ? { duration: 0 } : { layout: EASE_OPEN, duration: 0.18 }}
                onClick={() => {
                  setSelectedEmail(c.email);
                  setShowList(false);
                  setError(null);
                }}
                className={cn(
                  "relative flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
                  active && "bg-accent",
                )}
              >
                {/* One marker for "you're here", sliding between rows. */}
                {active ? (
                  <motion.span
                    layoutId="inbox-active-row"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 40 }}
                    className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                  />
                ) : null}
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
              </motion.button>
            );
          })}
          </AnimatePresence>
        </div>
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
              {/* Keyed on the person, so switching reads as one identity giving
                  way to another rather than text mutating in place. */}
              <motion.div
                key={contact.email}
                initial={switching ? { opacity: 0, x: 6 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(contact.name, contact.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{contact.name ?? contact.email}</p>
                    <AnimatePresence initial={false}>
                      {contact.needsReply ? (
                        <motion.span
                          key="waiting"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={reduce ? { duration: 0 } : EASE_OPEN}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                        >
                          <span className="size-1.5 rounded-full bg-amber-500" /> waiting on you
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.email} · {contact.threads.length === 1 ? "1 subject" : `${contact.threads.length} subjects`}
                    {" · "}
                    <Link href={`/contacts?q=${encodeURIComponent(contact.email)}`} className="hover:text-foreground hover:underline">
                      their record
                    </Link>
                  </p>
                </div>
              </motion.div>
              {/* A brand-new subject = a brand-new thread — full composer, prefilled. */}
              <Link
                href={`/messages/new?to=${encodeURIComponent(contact.email)}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <PenSquare className="size-3.5" /> New email
              </Link>
            </header>

            {/* The rail must sit OUTSIDE the scroller. Inside it, `absolute` is
                relative to the scrolled CONTENT, so the table of contents slid
                away the moment you scrolled — which is precisely when you need
                it. This wrapper is the thing that doesn't move. */}
            <div className="relative min-h-0 flex-1">
            <OutlineRail
              containerRef={threadPaneRef}
              activeId={expandedThread ? `thread-${expandedThread}` : null}
              // Picking a conversation opens it — same as clicking its header,
              // including clearing a half-typed reply that belonged to the one
              // you're leaving.
              onSelect={(id) => {
                const tid = id.replace(/^thread-/, "");
                landAtReplyFor.current = tid;
                setExpandedThread(tid);
                setDraft("");
                setError(null);
              }}
              minSections={2}
              label="Jump to a conversation"
              sections={contact.threads.map((t) => ({
                id: `thread-${t.id}`,
                label: t.subject || "(no subject)",
                meta: relativeTime(t.last_message_at),
              }))}
            />
            <motion.div
              key={contact.email}
              ref={threadPaneRef}
              initial={switching ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="h-full space-y-3 overflow-y-auto px-4 py-4"
            >
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
                    <div
                      key={t.id}
                      id={`thread-${t.id}`}
                      className={cn("scroll-mt-2 rounded-xl border", expanded && "ring-1 ring-primary/30")}
                    >
                      {/* Thread header: the subject is the conversation. */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedThread(expanded ? null : t.id);
                          setDraft("");
                          setError(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-4 py-3 text-left",
                          // A long conversation pushed its own subject off the top,
                          // so half-way down you're reading emails with no idea
                          // which thread you're in. It stays.
                          expanded && "sticky top-0 z-10 rounded-t-xl border-b bg-card/95 backdrop-blur",
                        )}
                      >
                        <motion.span
                          animate={{ rotate: expanded ? 0 : -90 }}
                          transition={reduce ? { duration: 0 } : EASE_OPEN}
                          className="flex shrink-0 text-muted-foreground"
                        >
                          <ChevronDown className="size-4" />
                        </motion.span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{t.subject || "(no subject)"}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {count != null ? `${count} ${count === 1 ? "email" : "emails"} · ` : ""}
                            {relativeTime(t.last_message_at)}
                          </span>
                        </span>
                        <ThreadStatusBadge status={t.status} />
                      </button>

                      <AnimatePresence initial={false}>
                      {expanded ? (
                        <motion.div
                          key="thread-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduce ? { duration: 0 } : { height: EASE_OPEN, opacity: { duration: 0.16 } }}
                          className="overflow-hidden"
                        >
                        <div className="space-y-3 border-t px-3 pb-3 pt-3 sm:px-4">
                          {det?.messages ? (
                            // initial={false} keeps the thread from replaying its
                            // whole history on open — but the reply you just sent
                            // is genuinely new, so it slides in.
                            <AnimatePresence initial={false}>
                              {det.messages.map((m) => (
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
                              ))}
                            </AnimatePresence>
                          ) : (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="grid h-24 place-items-center text-muted-foreground"
                            >
                              <Loader2 className="size-4 animate-spin" />
                            </motion.div>
                          )}

                          {/* Reply composer — scoped to THIS subject-thread. */}
                          <div id={`reply-${t.id}`} className="scroll-mt-4 rounded-lg border bg-muted/20 p-3">
                            <p className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              Replying to {contact.name?.split(" ")[0] ?? contact.email} on{" "}
                              <span className="font-medium text-foreground">“{t.subject}”</span>
                              <InfoHint label="What a reply costs and counts as">
                                {det?.messages?.some((m) => m.kind === "campaign" || m.kind === "sequence" || m.kind === "marketing")
                                  ? "This conversation started from a bulk send, but a reply is one-to-one: it uses your transactional sends, never your marketing volume, and a personal conversation can't be unsubscribed from."
                                  : "A real one-to-one email — it uses your transactional sends, and a personal conversation can't be unsubscribed from."}
                              </InfoHint>
                            </p>
                            <AnimatePresence initial={false}>
                              {error ? (
                                <motion.p
                                  key="reply-error"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={reduce ? { duration: 0 } : { height: EASE_OPEN, opacity: { duration: 0.15 } }}
                                  className="overflow-hidden text-sm text-destructive"
                                >
                                  <span className="mb-2 block">{error}</span>
                                </motion.p>
                              ) : null}
                            </AnimatePresence>
                            <div className="flex items-end gap-2">
                              <Textarea
                                ref={composerRef}
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
                                className="min-h-0 resize-none overflow-hidden bg-background transition-shadow"
                              />
                              <motion.div whileTap={reduce || sending ? undefined : { scale: 0.96 }} className="shrink-0">
                                <Button
                                  onClick={reply}
                                  disabled={sending || !draft.trim()}
                                  className="w-[108px] justify-center overflow-hidden"
                                >
                                  {/* One button, three things to say — swapped, not redrawn. */}
                                  <AnimatePresence mode="wait" initial={false}>
                                    <motion.span
                                      key={sending ? "sending" : justSent ? "sent" : "idle"}
                                      initial={reduce ? false : { opacity: 0, y: 8 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                      transition={{ duration: reduce ? 0 : 0.14 }}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      {sending ? (
                                        <>
                                          <Loader2 className="size-4 animate-spin" /> Sending
                                        </>
                                      ) : justSent ? (
                                        <>
                                          <Check className="size-4" /> Sent
                                        </>
                                      ) : (
                                        <>
                                          <Send className="size-4" /> Reply
                                        </>
                                      )}
                                    </motion.span>
                                  </AnimatePresence>
                                </Button>
                              </motion.div>
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
                              {sandbox ? (
                                // A demo tool for the sandbox only — in live, everything in the
                                // inbox is a real email from a real person.
                                <button
                                  onClick={simulate}
                                  disabled={sending}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                  <Sparkles className="size-3" /> Simulate a reply
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        </motion.div>
                      ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </motion.div>
            </div>
          </>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">Pick a conversation to open it.</div>
        )}
      </section>
    </div>
  );
}
