"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, Sparkles, Square, User } from "lucide-react";
import {
  createChat,
  deleteChat,
  loadChat,
  renameChat,
  revalidateAssistantSideEffects,
  type AssistantChat,
  type AssistantChatMessage,
} from "./actions";
import { ConversationRail } from "./conversation-rail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { AssistantWorking } from "@/components/app/assistant-working";
import { OutlineRail } from "@/components/app/outline-rail";
import { friendlyAction } from "@/lib/assistant-actions";
import { streamAssistant } from "@/lib/assistant-stream";
import { CreditMeter, CreditNudge, isOutOfCredits, type Credits } from "@/components/app/ai-credit-meter";
import { cn } from "@/lib/utils";

// Grouped so the assistant's range — it builds, operates, AND diagnoses — is
// obvious the moment the page opens, not hidden behind a blank prompt box.
const SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Build", items: ["Set up a 3-step welcome sequence", "Create a launch email template"] },
  { label: "Operate", items: ["Add alex@acme.com to my Beta list", "Draft & schedule a launch announcement"] },
  // Reply and audience questions were unanswerable until the assistant got tools
  // for the inbox and contacts — so the prompts never advertised them.
  { label: "Replies", items: ["What still needs answering?", "Summarise my latest reply"] },
  { label: "Audience", items: ["How many contacts do I have?", "Who's tagged vip?"] },
  { label: "Measure", items: ["How did my last campaign do?", "Who opened it?"] },
  { label: "Diagnose", items: ["Why did my recent emails bounce?", "Am I set up to send?"] },
];

/** Tools that change something a page is showing. A read-only run shouldn't
 * bust every cached list. */
const MUTATING = /^(create|send|add|reply|update|delete)_/;

let tempCounter = 0;
const tempId = () => `tmp_${Date.now()}_${tempCounter++}`;

const MAX_COMPOSER_PX = 160; // grow the composer to ~6 rows, then let it scroll

export function AssistantChat({ initialChats, initialCredits, onSupport }: { initialChats: AssistantChat[]; initialCredits: Credits | null; onSupport: () => void }) {
  const [chats, setChats] = useState<AssistantChat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [credits, setCredits] = useState<Credits | null>(initialCredits);
  const [input, setInput] = useState("");
  const [pending, startSend] = useTransition();
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);

  const ref = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const didInit = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el && followLatest.current) el.scrollTop = el.scrollHeight;
  }, []);

  // Keep the transcript pinned to the latest turn as it grows.
  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
    else if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [messages, pending, scrollToEnd]);

  // Grow the composer to fit its content (and shrink back when it's cleared).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  }, [input]);

  const openChat = useCallback(async (id: string) => {
    if (pending) return;
    const version = ++loadVersion.current;
    setLoadingChat(true);
    setError(null);
    const res = await loadChat(id);
    if (version !== loadVersion.current) return;
    setLoadingChat(false);
    followLatest.current = true;
    if (res.chat) { setActiveChatId(id); setMessages(res.chat.messages); }
    else setError(res.error ?? "Couldn't load this chat. Please try again.");
  }, [pending]);

  /**
   * Stop watching the current run.
   *
   * It stops the STREAM, not the work: the request is already with the model,
   * and the server finishes it and saves the turn either way. So don't pretend
   * otherwise, and don't re-fetch the chat to "show the truth" — at the moment
   * you press stop the truth isn't written yet, and reloading replaces a
   * half-finished answer with an empty conversation.
   *
   * Keep what arrived, say plainly where the rest went.
   */
  const stop = useCallback(() => {
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
                "_You stopped watching. The assistant finishes this answer either way — reopen this chat in a moment to read all of it._",
            }
          : t,
      ),
    );
  }, []);

  const newChat = useCallback(() => {
    if (pending || loadingChat) return;
    setActiveChatId(null);
    setMessages([]);
    setInput("");
    requestAnimationFrame(() => ref.current?.focus());
  }, [pending, loadingChat]);

  const removeChat = useCallback(
    async (id: string) => {
      if (pending || loadingChat) return;
      // Deleting a chat is irreversible and the button sits one pixel from
      // "rename" — ask before destroying someone's history.
      const title = chats.find((c) => c.id === id)?.title ?? "this chat";
      if (!window.confirm(`Delete “${title}”? The conversation can't be recovered.`)) return;
      const result = await deleteChat(id);
      if (!result.ok) { setError(result.error ?? "Couldn't delete this conversation."); return; }
      setChats((cs) => cs.filter((c) => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
    },
    [activeChatId, chats, pending, loadingChat],
  );

  // Rename, optimistic — reverted if the API rejects it. The rail owns the
  // editing UI; this owns the list it edits.
  const commitRenameById = useCallback(
    (id: string, next: string) => {
      const current = chats.find((c) => c.id === id);
      if (!current || next === current.title) return;
      setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title: next } : c)));
      void renameChat(id, next).then((res) => {
        if (res.error) setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title: current.title } : c)));
      });
    },
    [chats],
  );

  // Send a prompt into the active chat — lazily creating a chat on the first
  // message so empty chats never pile up. Optimistically renders the user turn.
  const submit = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text || pending || loadingChat || (credits && isOutOfCredits(credits))) return;
      setInput("");
      followLatest.current = true;

      const userTurn: AssistantChatMessage = {
        object: "assistant_message",
        id: tempId(),
        role: "user",
        content: text,
        actions: [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, userTurn]);

      startSend(async () => {
        let chatId = activeChatId;
        // First message in a new conversation → create the chat now.
        if (!chatId) {
          const created = await createChat();
          if (!created.chat) {
            setMessages((m) => [
              ...m,
              { object: "assistant_message", id: tempId(), role: "assistant", content: created.error ?? "Couldn't start a chat.", actions: [], created_at: new Date().toISOString() },
            ]);
            return;
          }
          chatId = created.chat.id;
          setActiveChatId(chatId);
          setChats((cs) => [created.chat!, ...cs]);
        }

        // Stream the run. A placeholder assistant turn goes in immediately and
        // fills as the text arrives, so the answer is readable while it's still
        // being written instead of appearing all at once at the end.
        const turnId = tempId();
        setMessages((m) => [
          ...m,
          {
            object: "assistant_message",
            id: turnId,
            role: "assistant",
            content: "",
            actions: [],
            created_at: new Date().toISOString(),
          },
        ]);
        const patch = (fn: (t: AssistantChatMessage) => AssistantChatMessage) =>
          setMessages((m) => m.map((t) => (t.id === turnId ? fn(t) : t)));

        let title: string | undefined;
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        await streamAssistant(chatId, text, {
          onDelta: (chunk) => patch((t) => ({ ...t, content: t.content + chunk })),
          onTool: (a) => patch((t) => ({ ...t, actions: [...(t.actions ?? []), a] })),
          onDone: (d) => {
            title = d.chat.title;
            // The assistant may have just built or sent something; the pages
            // showing it are still serving their cached copy.
            if (d.actions.some((a) => MUTATING.test(a.tool) && a.status < 400)) {
              void revalidateAssistantSideEffects();
            }
            // Trust the persisted reply over the accumulated deltas — they should
            // match, and if they ever don't, the stored turn is the real one.
            patch((t) => ({ ...t, content: d.reply || t.content || "Done.", actions: d.actions }));
            if (d.credits) {
              const { used, allowance } = d.credits;
              setCredits({ used, allowance, remaining: allowance === -1 ? -1 : Math.max(0, allowance - used) });
            }
          },
          onError: (message) => {
            patch((t) => ({ ...t, content: t.content ? `${t.content}\n\n${message}` : message }));
            // A refusal is usually the credit gate; reflect "out" so the meter
            // and nudge stop claiming there's headroom.
            if (/credit/i.test(message)) {
              setCredits((c) => (c ? { ...c, used: c.allowance, remaining: 0 } : c));
            }
          },
        }, ctrl.signal);
        abortRef.current = null;

        // Reflect the backend's content-based title (it auto-names on the first
        // message) and move the chat to the top of the rail.
        const id = chatId;
        setChats((cs) => {
          const moved = cs.find((c) => c.id === id);
          const rest = cs.filter((c) => c.id !== id);
          const nowIso = new Date().toISOString();
          return [
            { object: "assistant_chat", id, title: title ?? moved?.title ?? text, created_at: moved?.created_at ?? nowIso, updated_at: nowIso },
            ...rest,
          ];
        });
      });
    },
    [activeChatId, pending, loadingChat, credits],
  );

  // Deep link: other pages can hand off to the assistant with `?prompt=…`
  // (e.g. "Diagnose with assistant" on a bounced message). It starts a NEW chat
  // seeded with that prompt. Run once, then strip the query so a refresh doesn't re-fire.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const pre = new URLSearchParams(window.location.search).get("prompt");
    const chat = new URLSearchParams(window.location.search).get("chat");
    if (pre?.trim()) {
      submit(pre);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (chat) void openChat(chat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Has the in-flight run produced anything yet? Until it has, the working
  // indicator carries the wait; after that it would just duplicate the answer.
  const last = messages[messages.length - 1];
  const streamStarted =
    last?.role === "assistant" && (last.content.length > 0 || (last.actions?.length ?? 0) > 0);

  const hasConversation = messages.length > 0;
  const out = credits ? isOutOfCredits(credits) : false;

  return (
    <div className="help-surface grid min-w-0 gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <ConversationRail
        chats={chats}
        activeChatId={activeChatId}
        onOpen={openChat}
        onNew={newChat}
        onRename={commitRenameById}
        onDelete={removeChat}
        busy={pending || loadingChat}
      />

      {/* Conversation */}
      <Card className="min-w-0 overflow-hidden rounded-2xl shadow-e1">
        <CardContent className="flex h-[70dvh] min-h-[32rem] flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-3 border-b pb-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brass-rule bg-brass-tint text-brass-text"><Sparkles className="size-5" /></span><div className="min-w-0"><p className="text-sm font-semibold">AI assistant</p><p className="truncate text-sm text-muted-foreground">{chats.find((c) => c.id === activeChatId)?.title ?? "A little help with your next step"}</p></div></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {/* A row: the conversation, then the outline in its own lane beside
              it. The rail used to float over the answers, and it grows a tick
              per question — the longer the chat, the more of the reading it
              crossed. */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div ref={scrollRef} onScroll={(event) => { const el = event.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="h-full min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {loadingChat ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Opening conversation…</p> : !hasConversation ? (
                <div className="mx-auto flex max-w-3xl flex-col gap-5 py-4">
                  <div><h2 className="text-xl font-semibold">What would you like to work on?</h2><p className="mt-2 text-base leading-relaxed text-muted-foreground">Ask a question or choose a starting point. The assistant can work with your workspace, within your plan and role.</p></div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {SUGGESTION_GROUPS.map((g) => (
                      <div key={g.label} className="rounded-xl border bg-background p-3">
                        <span className="mb-1 block text-sm font-semibold">
                          {g.label}
                        </span>
                        {g.items.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => submit(s)}
                            disabled={pending || out}
                            className="block w-full rounded-lg px-2 py-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((t) => (
                  <div
                    key={t.id}
                    id={`turn-${t.id}`}
                    className={cn("flex items-start gap-2 scroll-mt-2", t.role === "user" ? "flex-row-reverse" : "flex-row")}
                  >
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-rule text-ink-muted">
                      {t.role === "user" ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    </span>
                    <div
                      className={cn(
                        "help-message min-w-0 max-w-[90%] rounded-2xl border px-4 py-3 text-base",
                        t.role === "user" ? "border-brass-rule bg-brass-tint text-foreground" : "bg-card",
                      )}
                    >
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{t.role === "user" ? "You" : "AI assistant"}</p>
                      {t.role === "user" ? (
                        <p className="whitespace-pre-wrap">{t.content}</p>
                      ) : (
                        <Markdown>{t.content}</Markdown>
                      )}
                      {t.actions && t.actions.length > 0 ? (
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

            {/* In-chat navigation: each prompt you asked is a section, so a long
                conversation can be walked instead of scrolled. */}
            <OutlineRail
              containerRef={scrollRef}
              label="Jump to a question"
              sections={messages
                .filter((m) => m.role === "user")
                .map((m) => ({
                  id: `turn-${m.id}`,
                  label: m.content.trim().replace(/\s+/g, " ").slice(0, 80),
                }))}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="shrink-0 border-t pt-3"
          >
            {credits ? <CreditNudge credits={credits} className="mb-2" /> : null}
            <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                aria-label="Message the AI assistant"
                ref={ref}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={out ? "Out of AI credits" : "Ask the assistant…"}
                disabled={out || loadingChat}
                className="max-h-40 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
              />
              {pending ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={stop}
                  aria-label="Stop watching answer"
                  title="Stop watching this answer (it still finishes and is saved)"
                  className="shrink-0"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || out || loadingChat}
                  aria-label="Send to AI assistant"
                  className="shrink-0"
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[12.5px] text-muted-foreground">
                <kbd className="rounded border bg-muted px-1 py-px font-sans text-[12px]">Enter</kbd> to send ·{" "}
                <kbd className="rounded border bg-muted px-1 py-px font-sans text-[12px]">Shift</kbd>
                <kbd className="ml-0.5 rounded border bg-muted px-1 py-px font-sans text-[12px]">Enter</kbd> for a new line
              </p>
              {credits ? <CreditMeter credits={credits} className="shrink-0" /> : null}
            </div>
          </form>
          {/* Same escalation path as the floating + docked modes — one tap from
              the AI to a real person, without leaving the help surface. */}
          <p className="mt-2 text-center text-[12.5px] text-muted-foreground">
            Need a human?{" "}
            <button type="button" onClick={onSupport} className="font-medium text-brass-text hover:underline">
              Talk to the support team
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
