"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ArrowLeft, ArrowUpRight, GripHorizontal, Headset, Loader2, MessagesSquare, PanelRight, PictureInPicture2, Plus, Search, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import {
  createChat,
  deleteChat,
  getAiCredits,
  listChats,
  loadChat,
  type AssistantChat,
  type AssistantChatMessage,
  revalidateAssistantSideEffects,
} from "@/app/(app)/assistant/actions";
import { groupByDay } from "@/lib/chat-buckets";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { CreditMeter, CreditNudge, isOutOfCredits, type Credits } from "@/components/app/ai-credit-meter";
import { listSupportThreads } from "@/app/(app)/support-actions";
import { SupportPane } from "@/components/app/support-pane";
import { AssistantWorking } from "./assistant-working";
import { friendlyAction } from "@/lib/assistant-actions";
import { streamAssistant } from "@/lib/assistant-stream";
import { cn } from "@/lib/utils";

// Context-aware starters: what the assistant can do RIGHT HERE, keyed by the
// section the user is in — so the same launcher feels native on every page.
const CONTEXT: { match: (p: string) => boolean; hint: string; prompts: string[] }[] = [
  { match: (p) => p.startsWith("/contacts") || p.startsWith("/lists"), hint: "your audience", prompts: ["Add alex@acme.com to my Beta list", "Who unsubscribed this week?", "Create an audience from a tag"] },
  { match: (p) => p.startsWith("/campaigns"), hint: "campaigns", prompts: ["Draft & schedule a launch campaign", "How did my last campaign do?"] },
  { match: (p) => p.startsWith("/sequences"), hint: "automations", prompts: ["Set up a 3-step welcome sequence", "Why did this sequence stop?"] },
  { match: (p) => p.startsWith("/messages") || p.startsWith("/inbox"), hint: "your sending", prompts: ["Why did my recent emails bounce?", "Show my delivery status", "Send a test email to myself"] },
  { match: (p) => p.startsWith("/templates"), hint: "templates", prompts: ["Create a launch email template", "Draft a password-reset email"] },
  { match: (p) => p.startsWith("/deliverability") || p.startsWith("/client-domains"), hint: "deliverability", prompts: ["How's my sending reputation?", "What DNS records do I still need?"] },
  { match: (p) => p.startsWith("/billing") || p.startsWith("/plan"), hint: "plan & usage", prompts: ["What am I paying for this month?", "How close am I to my limits?"] },
];
const DEFAULT_CTX = { hint: "your email", prompts: ["Set up a welcome sequence", "Why did an email bounce?", "Draft a campaign"] };

// Three ways to hold the assistant: the sidebar/full page (its own route) and,
// here, either a DOCKED drawer (focused, dims the page) or a FLOATING box
// (draggable, no backdrop — keep working on the page while you chat). Remembered.
type Mode = "float" | "drawer";
const MODE_KEY = "rm_assistant_mode";
/** Last support activity this user has actually read — drives the unread dot. */
const SEEN_KEY = "rm_support_seen_at";

/** The bubble is ONE door to two conversations: the AI assistant and a real
 * person on the support team. Which one you're in is always explicit. */
type Pane = "assistant" | "support";

/**
 * The panel is one column, so it can't grow the full page's conversation rail
 * beside the transcript — a 288px list inside a 380px float leaves nowhere to
 * read. Instead the panel BECOMES the list and comes back, the way a phone mail
 * app moves between inbox and message. Same two things to do, no second column.
 */
type View = "chat" | "list";

/**
 * Which conversation the compact assistant is in, remembered.
 *
 * It used to hold the chat id in state alone, so every reload started a fresh
 * one and the previous exchange was unreachable from anywhere but the full
 * page. You would ask something, navigate, come back, and be talking to a
 * stranger. The id survives now, and reopening resumes where you were.
 */
const CHAT_KEY = "rm_assistant_chat";
/** Below this the list is short enough to scan; a filter would be clutter. */
const FILTER_THRESHOLD = 6;

let tmp = 0;
const tempId = () => `l_${Date.now()}_${tmp++}`;

export function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("assistant");
  const [unread, setUnread] = useState(false);
  const [mode, setMode] = useState<Mode>("float");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [view, setView] = useState<View>("chat");
  const [chats, setChats] = useState<AssistantChat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [resuming, setResuming] = useState(false);
  const [input, setInput] = useState("");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [pending, start] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenRef = useRef<string | null>(null);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const ctx = CONTEXT.find((c) => c.match(pathname)) ?? DEFAULT_CTX;
  const hidden = pathname.startsWith("/assistant"); // full page owns this real estate

  // Restore the remembered presentation.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (saved === "drawer" || saved === "float") setMode(saved);
    try {
      seenRef.current = window.localStorage.getItem(SEEN_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  // A staff reply should find the user, not wait to be found: poll the support
  // conversations in the background and dot the bubble when the team has written
  // since the last time this user read the thread. Cheap (one indexed list query)
  // and paused while the support pane is already open — that's a read, not a poll.
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    const check = async () => {
      if (open && pane === "support") return; // they're reading it right now
      const res = await listSupportThreads();
      if (!alive || !res.data?.length) return;
      const newest = res.data.reduce((a, b) => (a.last_message_at > b.last_message_at ? a : b));
      // Unread = the newest activity is newer than what this user last saw AND
      // it isn't just their own message echoing back.
      const seen = seenRef.current;
      if ((!seen || newest.last_message_at > seen) && newest.status === "open") {
        setUnread(true);
      }
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hidden, open, pane]);
  const switchMode = (m: Mode) => {
    setMode(m);
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  };

  const scrollEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);
  useEffect(() => { if (open) scrollEnd(); }, [messages, pending, open, mode, scrollEnd]);

  // Pull the balance when the panel opens (proactive nudges, not just post-send).
  useEffect(() => {
    if (open && !credits) void getAiCredits().then((c) => c && setCredits(c));
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, credits]);

  const rememberChat = useCallback((id: string | null) => {
    try {
      if (id) window.localStorage.setItem(CHAT_KEY, id);
      else window.localStorage.removeItem(CHAT_KEY);
    } catch {
      /* private mode — this session still works, it just won't be resumed */
    }
  }, []);

  // Reopening returns you to the conversation you were having. Only on the
  // first open with nothing loaded: after that the panel's own state is the
  // truth, and re-fetching would stamp on a run in progress.
  useEffect(() => {
    if (!open || chatId || messages.length > 0 || resuming) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(CHAT_KEY);
    } catch {
      /* nothing remembered */
    }
    if (!saved) return;
    setResuming(true);
    void loadChat(saved).then((r) => {
      setResuming(false);
      if (r.chat) {
        setChatId(r.chat.id);
        setMessages(r.chat.messages);
      } else {
        // Deleted elsewhere (the full page, another tab). Forget it rather than
        // leaving a pointer to something that will never load.
        rememberChat(null);
      }
    });
  }, [open, chatId, messages.length, resuming, rememberChat]);

  const refreshChats = useCallback(async () => {
    setChatsLoading(true);
    const r = await listChats();
    setChatsLoading(false);
    if (r.chats) setChats(r.chats);
  }, []);

  // The list is also where the bar gets the current conversation's NAME, so it
  // can't wait until someone asks to see the list. A new chat is created
  // untitled and named from its content server-side, so the name we'd get back
  // at creation is already stale — fetching on open (and after each run, below)
  // is what keeps the bar telling the truth. One indexed query.
  useEffect(() => {
    if (open && pane === "assistant" && chats.length === 0 && !chatsLoading) void refreshChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pane]);

  const showChats = useCallback(() => {
    setView("list");
    setChatQuery("");
    void refreshChats();
  }, [refreshChats]);

  const openChat = useCallback(
    async (id: string) => {
      setView("chat");
      setResuming(true);
      const r = await loadChat(id);
      setResuming(false);
      if (r.chat) {
        setChatId(r.chat.id);
        setMessages(r.chat.messages);
        rememberChat(r.chat.id);
      }
    },
    [rememberChat],
  );

  const startNewChat = useCallback(() => {
    // No round-trip: the chat row is created on the first message, exactly as it
    // always was. This just clears the desk.
    setChatId(null);
    setMessages([]);
    rememberChat(null);
    setView("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [rememberChat]);

  const removeChat = useCallback(
    async (id: string) => {
      setChats((c) => c.filter((x) => x.id !== id)); // optimistic — it's a list
      const r = await deleteChat(id);
      if (!r.ok) {
        void refreshChats();
        return;
      }
      if (id === chatId) startNewChat();
    },
    [chatId, refreshChats, startNewChat],
  );

  // Esc closes — but only the docked drawer (which dims the page); the floating
  // box shouldn't steal Escape from whatever the user is doing on the page.
  useEffect(() => {
    if (!open || mode !== "drawer") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode]);

  /** Stops the stream, not the run — see the page's note. */
  const stopRun = useCallback(() => {
    const ctrl = abortRef.current;
    if (!ctrl) return;
    ctrl.abort();
    abortRef.current = null;
    setMessages((m) =>
      m.map((t, i) =>
        i === m.length - 1 && t.role === "assistant"
          ? {
              ...t,
              content:
                (t.content ? `${t.content}\n\n` : "") +
                "_You stopped watching. The assistant finishes this answer either way — reopen the assistant in a moment to read all of it._",
            }
          : t,
      ),
    );
  }, []);

  const submit = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text || pending) return;
      if (credits && isOutOfCredits(credits)) return;
      setInput("");
      setMessages((m) => [...m, { object: "assistant_message", id: tempId(), role: "user", content: text, actions: [], created_at: new Date().toISOString() }]);
      start(async () => {
        let id = chatId;
        if (!id) {
          const created = await createChat();
          if (!created.chat) {
            setMessages((m) => [...m, { object: "assistant_message", id: tempId(), role: "assistant", content: created.error ?? "Couldn't start a chat.", actions: [], created_at: new Date().toISOString() }]);
            return;
          }
          id = created.chat.id;
          setChatId(id);
          rememberChat(id); // so closing the panel doesn't orphan this exchange
        }
        // Same streamed run as the full page — the drawer is where people ask
        // the quick questions, so waiting blind matters just as much here.
        const turnId = tempId();
        setMessages((m) => [...m, { object: "assistant_message", id: turnId, role: "assistant", content: "", actions: [], created_at: new Date().toISOString() }]);
        const patch = (fn: (t: AssistantChatMessage) => AssistantChatMessage) =>
          setMessages((m) => m.map((t) => (t.id === turnId ? fn(t) : t)));
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        await streamAssistant(id, text, {
          onDelta: (chunk) => patch((t) => ({ ...t, content: t.content + chunk })),
          onTool: (a) => patch((t) => ({ ...t, actions: [...(t.actions ?? []), a] })),
          onDone: (d) => {
            patch((t) => ({ ...t, content: d.reply || t.content || "Done.", actions: d.actions }));
            if (d.actions.some((a) => /^(create|send|add|reply|update|delete)_/.test(a.tool) && a.status < 400)) {
              void revalidateAssistantSideEffects();
            }
            if (d.credits) {
              setCredits({ used: d.credits.used, allowance: d.credits.allowance, remaining: d.credits.allowance === -1 ? -1 : Math.max(0, d.credits.allowance - d.credits.used) });
            }
            // The server names a chat from its content, so the title only
            // becomes real once a turn has completed. Pick it up.
            void refreshChats();
          },
          onError: (message) => patch((t) => ({ ...t, content: t.content ? `${t.content}\n\n${message}` : message })),
        }, ctrl.signal);
        abortRef.current = null;
      });
    },
    [chatId, pending, credits, rememberChat, refreshChats],
  );

  if (hidden) return null;

  // Until the run produces text or a tool, the working indicator carries the
  // wait; after that the answer itself is the progress.
  const lastTurn = messages[messages.length - 1];
  const streamStarted =
    lastTurn?.role === "assistant" && (lastTurn.content.length > 0 || (lastTurn.actions?.length ?? 0) > 0);

  const out = credits ? isOutOfCredits(credits) : false;
  const floating = mode === "float";

  // Shared header. In float mode it doubles as the drag handle.
  const header = (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3 py-2.5",
        floating && "cursor-grab select-none active:cursor-grabbing",
      )}
      onPointerDown={floating ? (e) => dragControls.start(e) : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        {floating ? <GripHorizontal className="size-4 shrink-0 text-muted-foreground/40" /> : null}
        {/* WHO you're talking to — the AI or a person — never ambiguous. */}
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            pane === "assistant"
              ? "bg-primary/10 text-primary"
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {pane === "assistant" ? <Sparkles className="size-4" /> : <Headset className="size-4" />}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">
            {pane === "assistant" ? "AI assistant" : "Support team"}
          </p>
          {pane === "assistant" ? (
            credits ? (
              <CreditMeter credits={credits} />
            ) : (
              <span className="text-[11px] text-muted-foreground">Here to help with {ctx.hint}</span>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground">You&apos;re talking to a real person</span>
          )}
        </div>
      </div>
      {/* Controls must not start a drag. */}
      <div className="flex shrink-0 items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
        {floating ? (
          <button type="button" onClick={() => switchMode("drawer")} title="Dock to the side" aria-label="Dock to the side" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <PanelRight className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={() => switchMode("float")} title="Pop out into a floating window" aria-label="Pop out into a floating window" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <PictureInPicture2 className="size-4" />
          </button>
        )}
        <Link href="/assistant" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Open the full assistant" aria-label="Open the full assistant">
          <ArrowUpRight className="size-4" />
        </Link>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );

  // The pane switch — two tabs, like every chat product: talk to the AI, or talk
  // to a person, without losing either conversation.
  const paneTabs = (
    <div className="flex shrink-0 gap-1 border-b px-3 py-2">
      {([
        { id: "assistant" as const, label: "AI assistant", Icon: Sparkles },
        { id: "support" as const, label: "Support", Icon: Headset },
      ]).map((t) => {
        const on = pane === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setPane(t.id)}
            aria-pressed={on}
            className={cn(
              "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on ? (
              <motion.span layoutId="help-pane-tab" className="absolute inset-0 rounded-md bg-secondary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
            ) : null}
            <span className="relative z-10 flex items-center gap-1.5">
              <t.Icon className="size-3.5" /> {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const activeChat = chats.find((c) => c.id === chatId) ?? null;

  /**
   * The one row that makes the compact assistant a place you can come back to
   * rather than a fresh notepad every time: which conversation you're in, the
   * way to the others, and the way to a new one.
   *
   * Deliberately three small controls, not a rail. The full page can afford a
   * column; a 380px float cannot, and shrinking that column to fit would give
   * you a list too narrow to read AND a transcript too narrow to read.
   */
  const chatBar = (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <button
        type="button"
        onClick={showChats}
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Your conversations"
      >
        <MessagesSquare className="size-3.5 shrink-0" />
        <span className="truncate">
          {resuming ? "Opening…" : (activeChat?.title ?? (messages.length > 0 ? "This conversation" : "New conversation"))}
        </span>
      </button>
      <button
        type="button"
        onClick={startNewChat}
        disabled={!chatId && messages.length === 0}
        title="Start a new conversation"
        aria-label="Start a new conversation"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );

  const filteredChats = (() => {
    const q = chatQuery.trim().toLowerCase();
    return q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  })();

  const chatListView = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => setView("chat")}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">
          {chats.length > 0 ? `${chats.length} conversation${chats.length === 1 ? "" : "s"}` : "Conversations"}
        </span>
        <button
          type="button"
          onClick={startNewChat}
          title="Start a new conversation"
          aria-label="Start a new conversation"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {chats.length >= FILTER_THRESHOLD ? (
        <div className="relative shrink-0 border-b px-2 py-1.5">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="Filter conversations"
            aria-label="Filter conversations"
            className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {chatsLoading && chats.length === 0 ? (
          <div className="grid h-24 place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No conversations yet. Ask the assistant something and it&apos;ll keep the thread.
          </p>
        ) : filteredChats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing matches “{chatQuery}”.</p>
        ) : (
          groupByDay(filteredChats, (c) => c.updated_at).map((g) => (
            <div key={g.bucket} className="space-y-0.5">
              <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.bucket}
              </p>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-accent",
                    c.id === chatId && "bg-accent/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openChat(c.id)}
                    className="min-w-0 flex-1 px-1 py-1.5 text-left"
                  >
                    {/* Not truncated. A list whose only job is telling
                        conversations apart must show enough to tell them apart —
                        the full page learned this the hard way. */}
                    <span className="block break-words text-xs font-medium leading-snug">{c.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {relativeTime(c.updated_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeChat(c.id)}
                    title="Delete this conversation"
                    aria-label={`Delete ${c.title}`}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const conversationBody = (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              I can build, run, and diagnose your email — right here, without leaving this page. Try one of these for {ctx.hint}:
            </p>
            <div className="flex flex-col gap-1.5">
              {ctx.prompts.map((p) => (
                <button key={p} type="button" onClick={() => submit(p)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-lg px-3 py-2 text-sm", t.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                {t.role === "user" ? <p className="whitespace-pre-wrap">{t.content}</p> : <Markdown>{t.content}</Markdown>}
                {t.role !== "user" && t.actions && t.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    <Sparkles className="size-3 shrink-0 opacity-70" />
                    {t.actions.map((a, j) => (
                      <span key={j} className={cn("inline-flex items-center gap-1.5", a.status >= 400 && "text-amber-600 dark:text-amber-500")}>
                        {j > 0 ? <span className="opacity-40">·</span> : null}
                        {friendlyAction(a.tool)}
                        {a.status >= 400 ? " (couldn't complete)" : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {pending && !streamStarted ? <AssistantWorking /> : null}
      </div>

      <div className="border-t p-3">
        {credits ? <CreditNudge credits={credits} className="mb-2" /> : null}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="flex items-end gap-2 rounded-xl border bg-background p-1.5 shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
        >
          <Textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={out ? "Out of AI credits — add more to continue" : "Ask the assistant to do something…"}
            disabled={out}
            className="max-h-32 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
            }}
          />
          {pending ? (
            <Button type="button" size="icon" variant="outline" onClick={stopRun} aria-label="Stop" title="Stop watching this answer (it still finishes and is saved)" className="shrink-0">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || out} aria-label="Send" className="shrink-0">
              <Send className="size-4" />
            </Button>
          )}
        </form>
        {/* The handoff: escalate to a person WITHOUT losing what you just said —
            the transcript rides along so support lands mid-problem. */}
        <button
          type="button"
          onClick={() => setPane("support")}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Headset className="size-3" />
          {messages.length > 0 ? "Talk to a human about this instead" : "Talk to a human instead"}
        </button>
      </div>
    </>
  );

  // One panel, two things it can be showing. The list REPLACES the transcript
  // rather than sitting beside it — see the note on `View`.
  const assistantBody =
    view === "list" ? (
      chatListView
    ) : (
      <>
        {chatBar}
        {conversationBody}
      </>
    );

  // The handoff transcript — the last few turns, so the team sees the context.
  const handoff =
    messages.length > 0
      ? messages
          .slice(-6)
          .map((m) => `${m.role === "user" ? "Me" : "Assistant"}: ${m.content}`)
          .join("\n")
      : undefined;

  const body = (
    <>
      {paneTabs}
      {pane === "assistant" ? (
        assistantBody
      ) : (
        <SupportPane
          handoffContext={handoff}
          onSeen={(at) => {
            seenRef.current = at;
            try {
              localStorage.setItem(SEEN_KEY, at);
            } catch {
              /* private mode — the dot just returns next load */
            }
            setUnread(false);
          }}
        />
      )}
    </>
  );

  return (
    <>
      {/* Floating trigger — present on every page */}
      <AnimatePresence>
        {!open ? (
          <motion.button
            type="button"
            onClick={() => {
              // If the team is waiting on them, open straight into that reply.
              if (unread) setPane("support");
              setOpen(true);
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary py-3 pl-3.5 pr-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            aria-label="Get help — AI assistant or the support team"
          >
            {/* ONE door to both conversations, so the label can't imply only one. */}
            <MessagesSquare className="size-4" /> Chat
            {/* The team wrote back — findable without opening anything. */}
            {unread ? (
              <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center">
                <span className="absolute size-3.5 animate-ping rounded-full bg-emerald-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400 ring-2 ring-primary" />
              </span>
            ) : null}
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && !floating ? (
          /* DOCKED drawer — focused; dims + captures the page */
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-2xl"
              role="dialog"
              aria-label="Assistant"
            >
              {header}
              {body}
            </motion.aside>
          </>
        ) : null}

        {open && floating ? (
          /* FLOATING box — draggable, NO backdrop; the page stays fully usable */
          <>
            <div ref={constraintsRef} aria-hidden className="pointer-events-none fixed inset-3 z-40" />
            <motion.div
              key="float"
              drag
              dragControls={dragControls}
              dragListener={false}
              dragMomentum={false}
              dragConstraints={constraintsRef}
              dragElastic={0.03}
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto fixed bottom-5 right-5 z-50 flex h-[min(34rem,78vh)] w-[23rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
              role="dialog"
              aria-label="Assistant"
            >
              {header}
              {body}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
