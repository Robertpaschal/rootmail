"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ArrowUpRight, GripHorizontal, Loader2, PanelRight, PictureInPicture2, Send, Sparkles, X } from "lucide-react";
import {
  createChat,
  getAiCredits,
  sendChatMessage,
  type AssistantChatMessage,
} from "@/app/(app)/assistant/actions";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { CreditMeter, CreditNudge, isOutOfCredits, type Credits } from "@/components/app/ai-credit-meter";
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

let tmp = 0;
const tempId = () => `l_${Date.now()}_${tmp++}`;

export function AssistantLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("float");
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const ctx = CONTEXT.find((c) => c.match(pathname)) ?? DEFAULT_CTX;
  const hidden = pathname.startsWith("/assistant"); // full page owns this real estate

  // Restore the remembered presentation.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (saved === "drawer" || saved === "float") setMode(saved);
  }, []);
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

  // Esc closes — but only the docked drawer (which dims the page); the floating
  // box shouldn't steal Escape from whatever the user is doing on the page.
  useEffect(() => {
    if (!open || mode !== "drawer") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode]);

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
        }
        const res = await sendChatMessage(id, text);
        if (res.credits) setCredits({ used: res.credits.used, allowance: res.credits.allowance, remaining: res.credits.allowance === -1 ? -1 : Math.max(0, res.credits.allowance - res.credits.used) });
        setMessages((m) => [...m, { object: "assistant_message", id: tempId(), role: "assistant", content: res.error ?? res.reply ?? "Done.", actions: res.actions ?? [], created_at: new Date().toISOString() }]);
      });
    },
    [chatId, pending, credits],
  );

  if (hidden) return null;

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
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">Assistant</p>
          {credits ? <CreditMeter credits={credits} /> : <span className="text-[11px] text-muted-foreground">Here to help with {ctx.hint}</span>}
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

  const body = (
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
              </div>
            </div>
          ))
        )}
        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-lg bg-secondary px-3 py-2"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
          </div>
        ) : null}
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
          <Button type="submit" size="icon" disabled={pending || !input.trim() || out} aria-label="Send" className="shrink-0">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Floating trigger — present on every page */}
      <AnimatePresence>
        {!open ? (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary py-3 pl-3.5 pr-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            aria-label="Ask the assistant"
          >
            <Sparkles className="size-4" /> Ask AI
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
