"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useDragControls, useMotionValue } from "framer-motion";
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
import { animateSurface, type SurfaceRect } from "@/lib/ui-motion";
import { SegmentedControl } from "./segmented-control";

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
  const [supportVisited, setSupportVisited] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const followLatest = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenRef = useRef<string | null>(null);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const previousPanel = useRef<SurfaceRect | null>(null);
  const panelAnimation = useRef<Animation | null>(null);
  const [dragBounds, setDragBounds] = useState({ left: 0, right: 0, top: 0, bottom: 0 });

  const measureDragBounds = useCallback(() => {
    const dialog = dialogRef.current;
    const container = constraintsRef.current;
    if (!dialog?.open || !container) return;
    const box = dialog.getBoundingClientRect();
    const limit = container.getBoundingClientRect();
    const left = box.left - dragX.get();
    const top = box.top - dragY.get();
    const bounds = { left: limit.left - left, right: limit.right - left - box.width, top: limit.top - top, bottom: limit.bottom - top - box.height };
    setDragBounds(bounds);
    dragX.set(Math.max(bounds.left, Math.min(bounds.right, dragX.get())));
    dragY.set(Math.max(bounds.top, Math.min(bounds.bottom, dragY.get())));
  }, [dragX, dragY]);

  const ctx = CONTEXT.find((c) => c.match(pathname)) ?? DEFAULT_CTX;
  const hidden = pathname.startsWith("/assistant"); // full page owns this real estate

  // Restore the remembered presentation.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === "drawer" || saved === "float") setMode(saved);
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
    previousPanel.current = dialogRef.current?.getBoundingClientRect() ?? null;
    setMode(m);
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  };

  useEffect(() => { if (pane === "support") setSupportVisited(true); }, [pane]);

  // One persistent native dialog: docking changes focus isolation, not the
  // conversation tree. Browser modal behavior provides focus trapping/inertness.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    panelAnimation.current?.cancel();
    const wasOpen = dialog.open;
    if (dialog.open) dialog.close();
    dragX.set(0); dragY.set(0);
    // Motion values paint on the next frame. Measure the undragged destination
    // now; the observed source rect above already includes the previous drag.
    dialog.style.transform = "none";
    if (open && !hidden) {
      if (mode === "drawer") dialog.showModal();
      else dialog.show();
      if (mode === "float") measureDragBounds();
      panelAnimation.current = animateSurface(dialog, previousPanel.current);
    } else if (!hidden && wasOpen) triggerRef.current?.focus();
    previousPanel.current = null;
    return () => { panelAnimation.current?.cancel(); };
  }, [open, hidden, mode, dragX, dragY, measureDragBounds]);

  useEffect(() => {
    if (!open || mode !== "float") return;
    const onResize = () => {
      panelAnimation.current?.cancel();
      measureDragBounds();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, mode, measureDragBounds]);

  const scrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el && followLatest.current) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    if (open && messages.length > 0) scrollEnd();
    else if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [messages, pending, open, mode, scrollEnd]);

  // Pull the balance when the panel opens (proactive nudges, not just post-send).
  useEffect(() => {
    if (open && !credits) void getAiCredits().then((c) => c && setCredits(c));
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
        followLatest.current = true;
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
    else setError(r.error ?? "Couldn't load conversations.");
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
      if (pending || resuming) return;
      setError(null);
      setView("chat");
      setResuming(true);
      const r = await loadChat(id);
      setResuming(false);
      if (r.chat) {
        setChatId(r.chat.id);
        setMessages(r.chat.messages);
        rememberChat(r.chat.id);
      } else setError(r.error ?? "Couldn't open this conversation.");
    },
    [rememberChat, pending, resuming],
  );

  const startNewChat = useCallback(() => {
    if (pending || resuming) return;
    // No round-trip: the chat row is created on the first message, exactly as it
    // always was. This just clears the desk.
    setChatId(null);
    setMessages([]);
    rememberChat(null);
    setView("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [rememberChat, pending, resuming]);

  const removeChat = useCallback(
    async (id: string) => {
      if (pending || resuming) return;
      const title = chats.find((c) => c.id === id)?.title ?? "this conversation";
      if (!window.confirm(`Delete “${title}”? The conversation can't be recovered.`)) return;
      const r = await deleteChat(id);
      if (!r.ok) {
        setError(r.error ?? "Couldn't delete this conversation.");
        return;
      }
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === chatId) startNewChat();
    },
    [chatId, chats, pending, resuming, startNewChat],
  );

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
      if (!text || pending || resuming) return;
      if (credits && isOutOfCredits(credits)) return;
      followLatest.current = true;
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
    [chatId, pending, resuming, credits, rememberChat, refreshChats],
  );

  if (hidden) return null;

  // Until the run produces text or a tool, the working indicator carries the
  // wait; after that the answer itself is the progress.
  const lastTurn = messages[messages.length - 1];
  const streamStarted =
    lastTurn?.role === "assistant" && (lastTurn.content.length > 0 || (lastTurn.actions?.length ?? 0) > 0);

  const out = credits ? isOutOfCredits(credits) : false;
  const floating = mode === "float";

  // Shared header; only the explicit grip starts a drag.
  const header = (
    <div
      className="shrink-0 border-b bg-background px-3 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* WHO you're talking to — the AI or a person — never ambiguous. */}
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            pane === "assistant"
              ? "border border-brass-rule bg-brass-tint text-brass-text"
              : "border border-rule text-ink-muted",
          )}
        >
          {pane === "assistant" ? <Sparkles className="size-4" /> : <Headset className="size-4" />}
        </span>
        <div className="min-w-0 leading-tight">
          <p id="help-panel-title" className="text-base font-semibold">
            {pane === "assistant" ? "AI assistant" : "Support team"}
          </p>
          {pane === "assistant" ? (
            credits ? (
              <span className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">AI credits <CreditMeter credits={credits} /></span>
            ) : (
              <span className="text-[12.5px] text-muted-foreground">Here to help with {ctx.hint}</span>
            )
          ) : (
            <span className="text-sm text-muted-foreground">Messages with the Rootmail team</span>
          )}
        </div>
      </div>
      {/* Controls must not start a drag. */}
      <div className="mt-2 flex items-center justify-end gap-1">
        {floating ? <span className="mr-auto inline-flex min-h-11 touch-none cursor-grab items-center gap-2 px-2 text-sm text-muted-foreground" onPointerDown={(e) => dragControls.start(e)} title="Drag to move this window"><GripHorizontal className="size-4" /> Move</span> : <span className="mr-auto pl-2 text-sm text-muted-foreground">Docked panel</span>}
        {floating ? (
          <button type="button" onClick={() => switchMode("drawer")} title="Dock to the side" aria-label="Dock to the side" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <PanelRight className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={() => switchMode("float")} title="Pop out into a floating window" aria-label="Pop out into a floating window" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <PictureInPicture2 className="size-4" />
          </button>
        )}
        <Link href={pane === "support" ? "/assistant?pane=support" : chatId ? `/assistant?chat=${encodeURIComponent(chatId)}` : "/assistant"} onClick={() => setOpen(false)} className="inline-flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" title="Open full page" aria-label="Open full page">
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
    <SegmentedControl label="Help pane" value={pane} onChange={setPane} options={[{ value: "assistant", label: "AI assistant" }, { value: "support", label: "Support" }]} className="mx-3 my-3 shrink-0 border" />
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
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
        disabled={pending || resuming || (!chatId && messages.length === 0)}
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
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
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
            className="h-7 w-full rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {chatsLoading && chats.length === 0 ? (
          <div className="grid h-24 place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No conversations yet. Ask the assistant something and it&apos;ll keep the thread.
          </p>
        ) : filteredChats.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches “{chatQuery}”.</p>
        ) : (
          groupByDay(filteredChats, (c) => c.updated_at).map((g) => (
            <div key={g.bucket} className="space-y-0.5">
              <p className="px-2 pt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                    disabled={pending || resuming}
                    onClick={() => void openChat(c.id)}
                    className="min-w-0 flex-1 px-1 py-1.5 text-left"
                  >
                    {/* Not truncated. A list whose only job is telling
                        conversations apart must show enough to tell them apart —
                        the full page learned this the hard way. */}
                    <span className="block break-words text-sm font-medium leading-snug">{c.title}</span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {relativeTime(c.updated_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pending || resuming}
                    onClick={() => void removeChat(c.id)}
                    title="Delete this conversation"
                    aria-label={`Delete ${c.title}`}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
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
      <div ref={scrollRef} onScroll={(event) => { const el = event.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {resuming ? <p role="status" className="py-6 text-center text-sm text-muted-foreground">Opening conversation…</p> : messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-4 py-3 text-center">
            <span className="grid size-11 place-items-center rounded border border-rule text-ink-muted">
              <Sparkles className="size-5" />
            </span>
            <p className="max-w-xs text-base leading-relaxed text-muted-foreground">
              Get help with {ctx.hint}, without leaving this page. Ask a question or start here:
            </p>
            <div className="flex flex-col gap-1.5">
              {ctx.prompts.map((p) => (
                <button key={p} type="button" disabled={pending || resuming || out} onClick={() => submit(p)} className="rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("help-message min-w-0 max-w-[92%] rounded-2xl border px-4 py-3 text-base", t.role === "user" ? "border-brass-rule bg-brass-tint text-foreground" : "bg-background")}>
                <p className="mb-1 text-sm font-semibold text-muted-foreground">{t.role === "user" ? "You" : "AI assistant"}</p>
                {t.role === "user" ? <p className="whitespace-pre-wrap">{t.content}</p> : <Markdown>{t.content}</Markdown>}
                {t.role !== "user" && t.actions && t.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
                    <Sparkles className="size-3 shrink-0 opacity-70" />
                    {t.actions.map((a, j) => (
                      <span key={j} className={cn("inline-flex items-center gap-1.5", a.status >= 400 && "text-acted")}>
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
          className="flex items-end gap-2 rounded-lg border bg-background p-1.5 shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
        >
          <Textarea
            aria-label="Message the AI assistant"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // A textarea placeholder can't wrap into a one-row box, so anything
            // longer than the line is simply sliced mid-word — "Ask the
            // assistant to do somethi". The wider float helps but doesn't fix
            // it; the sentence has to be short enough to finish.
            placeholder={
              out
                ? floating
                  ? "Out of AI credits"
                  : "Out of AI credits — add more to continue"
                : floating
                  ? "Ask the assistant…"
                  : "Ask the assistant to do something…"
            }
            disabled={out || resuming}
            className="max-h-32 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(input); }
            }}
          />
          {pending ? (
            <Button type="button" size="icon" variant="outline" onClick={stopRun} aria-label="Stop watching answer" title="Stop watching this answer (it still finishes and is saved)" className="shrink-0">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || out || resuming} aria-label="Send to AI assistant" className="shrink-0">
              <Send className="size-4" />
            </Button>
          )}
        </form>
        {/* The handoff: escalate to a person WITHOUT losing what you just said —
            the transcript rides along so support lands mid-problem. */}
        <button
          type="button"
          onClick={() => setPane("support")}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
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
    <div key={view} className="ui-scene-enter flex min-h-0 flex-1 flex-col" style={{ "--ui-scene-x": view === "list" ? "-12px" : "12px" } as React.CSSProperties}>{view === "list" ? (
      chatListView
    ) : (
      <>
        {chatBar}
        {conversationBody}
      </>
    )}</div>;

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
      {error ? <p role="alert" className="mx-4 mb-2 text-sm text-destructive">{error}</p> : null}
      <div className={cn("min-h-0 flex-1 flex-col", pane === "assistant" ? "ui-content-enter flex" : "hidden")}>{assistantBody}</div>
      <div className={cn("min-h-0 flex-1 flex-col", pane === "support" ? "ui-content-enter flex" : "hidden")}>
      {supportVisited || pane === "support" ? (
        <SupportPane
          visible={open && pane === "support"}
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
      ) : null}
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (unread) setPane("support"); setOpen(true); }}
        className={cn("ui-help-trigger fixed bottom-5 right-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-brass-rule bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-e2 hover:brightness-110", open && "invisible")}
        aria-label="Get help — AI assistant or the support team"
        aria-expanded={open}
      >
        <MessagesSquare className="size-4" /> Help & chat
        {unread ? <span className="size-2 rounded-full bg-primary-foreground" aria-label="Unread support activity" /> : null}
      </button>
      <div ref={constraintsRef} aria-hidden className="pointer-events-none fixed inset-3" />
      <motion.dialog
        ref={dialogRef}
        drag={floating}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        // Ref constraints observe the panel's animated size and reposition it
        // on every frame. Numeric bounds change only with the real viewport.
        dragConstraints={dragBounds}
        dragElastic={0}
        style={{ x: dragX, y: dragY }}
        aria-labelledby="help-panel-title"
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && floating && !event.defaultPrevented) { event.preventDefault(); setOpen(false); }
        }}
        onClick={(event) => {
          if (floating || event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
        }}
        className={cn(
          "help-dialog help-surface fixed inset-auto m-0 flex max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%_-_1.5rem)] flex-col overflow-hidden rounded-2xl border bg-card p-0 text-foreground shadow-e3",
          floating ? "bottom-3 right-3 z-50 h-[min(44rem,calc(100dvh-1.5rem))] w-[28rem] sm:bottom-5 sm:right-5" : "bottom-3 right-3 top-3 h-[calc(100dvh-1.5rem)] w-[30rem]",
        )}
      >
        {header}
        {body}
      </motion.dialog>
    </>
  );
}
