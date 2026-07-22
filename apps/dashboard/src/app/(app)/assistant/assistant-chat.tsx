"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Pencil, Plus, Send, Sparkles, Trash2, User, X } from "lucide-react";
import {
  createChat,
  deleteChat,
  loadChat,
  renameChat,
  sendChatMessage,
  type AssistantChat,
  type AssistantChatMessage,
} from "./actions";
import { ConversationOutline } from "./conversation-outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { CreditMeter, CreditNudge, isOutOfCredits, type Credits } from "@/components/app/ai-credit-meter";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// What the assistant did, in plain language — honest about the steps it took to
// answer, without the raw tool names or HTTP status codes an end user doesn't need.
const ACTION_VERB: Record<string, string> = {
  get: "Looked up",
  list: "Reviewed",
  create: "Created",
  send: "Sent",
  check: "Checked",
  update: "Updated",
  draft: "Drafted",
  record: "Recorded",
  delete: "Removed",
  search: "Searched",
};
const ACTION_OVERRIDE: Record<string, string> = {
  get_message: "Looked up the message",
  get_message_audit: "Checked the delivery history",
  get_billing: "Checked plan & usage",
  get_analytics: "Pulled up analytics",
  get_deliverability: "Checked deliverability",
  check_suppression: "Checked the suppression list",
  check_domain_auth: "Checked domain setup",
  list_sub_tenants: "Reviewed your clients",
  send_test_message: "Sent a test email",
};
function friendlyAction(tool: string): string {
  if (ACTION_OVERRIDE[tool]) return ACTION_OVERRIDE[tool];
  const [verb, ...rest] = tool.split("_");
  const v = ACTION_VERB[verb];
  return v ? `${v} ${rest.join(" ")}` : tool.replace(/_/g, " ");
}

// Grouped so the assistant's range — it builds, operates, AND diagnoses — is
// obvious the moment the page opens, not hidden behind a blank prompt box.
const SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Build", items: ["Set up a 3-step welcome sequence", "Create a launch email template"] },
  { label: "Operate", items: ["Add alex@acme.com to my Beta list", "Draft & schedule a launch announcement"] },
  { label: "Diagnose", items: ["Why did my recent emails bounce?", "Show my recent delivery status"] },
];

let tempCounter = 0;
const tempId = () => `tmp_${Date.now()}_${tempCounter++}`;

const MAX_COMPOSER_PX = 160; // grow the composer to ~6 rows, then let it scroll

export function AssistantChat({ initialChats, initialCredits }: { initialChats: AssistantChat[]; initialCredits: Credits | null }) {
  const [chats, setChats] = useState<AssistantChat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [credits, setCredits] = useState<Credits | null>(initialCredits);
  const [input, setInput] = useState("");
  const [pending, startSend] = useTransition();
  const [loadingChat, setLoadingChat] = useState(false);
  // Rail inline-rename.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const ref = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Keep the transcript pinned to the latest turn as it grows.
  useEffect(() => {
    scrollToEnd();
  }, [messages, pending, scrollToEnd]);

  // Grow the composer to fit its content (and shrink back when it's cleared).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_PX)}px`;
  }, [input]);

  const openChat = useCallback(async (id: string) => {
    setActiveChatId(id);
    setLoadingChat(true);
    const res = await loadChat(id);
    setLoadingChat(false);
    if (res.chat) setMessages(res.chat.messages);
    else setMessages([{ object: "assistant_message", id: tempId(), role: "assistant", content: res.error ?? "Couldn't load this chat.", actions: [], created_at: new Date().toISOString() }]);
  }, []);

  const newChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setInput("");
    requestAnimationFrame(() => ref.current?.focus());
  }, []);

  const removeChat = useCallback(
    async (id: string) => {
      // Optimistic — drop it from the rail immediately.
      setChats((cs) => cs.filter((c) => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
      await deleteChat(id);
    },
    [activeChatId],
  );

  // Inline rename in the rail. Optimistic, reverting if the API rejects it.
  const startRename = useCallback((c: AssistantChat) => {
    setEditingId(c.id);
    setEditValue(c.title);
  }, []);
  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);
  const commitRename = useCallback(
    (id: string) => {
      const next = editValue.trim();
      setEditingId(null);
      const current = chats.find((c) => c.id === id);
      if (!next || !current || next === current.title) return;
      setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title: next } : c)));
      void renameChat(id, next).then((res) => {
        if (res.error) setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title: current.title } : c)));
      });
    },
    [editValue, chats],
  );

  // Send a prompt into the active chat — lazily creating a chat on the first
  // message so empty chats never pile up. Optimistically renders the user turn.
  const submit = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text || pending) return;
      setInput("");

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

        const res = await sendChatMessage(chatId, text);
        if (res.credits) {
          const { used, allowance } = res.credits;
          setCredits({ used, allowance, remaining: allowance === -1 ? -1 : Math.max(0, allowance - used) });
        } else if (res.upgrade) {
          // 402 from the credit gate — reflect "out" even without a fresh balance.
          setCredits((c) => (c ? { ...c, used: c.allowance, remaining: 0 } : c));
        }
        setMessages((m) => [
          ...m,
          {
            object: "assistant_message",
            id: tempId(),
            role: "assistant",
            content: res.error ?? res.reply ?? "Done.",
            actions: res.actions ?? [],
            created_at: new Date().toISOString(),
          },
        ]);
        // Reflect the backend's content-based title (it auto-names on the first
        // message) and move the chat to the top of the rail.
        const id = chatId;
        setChats((cs) => {
          const moved = cs.find((c) => c.id === id);
          const rest = cs.filter((c) => c.id !== id);
          const nowIso = new Date().toISOString();
          const title = res.title ?? moved?.title ?? text;
          return [{ object: "assistant_chat", id, title, created_at: moved?.created_at ?? nowIso, updated_at: nowIso }, ...rest];
        });
      });
    },
    [activeChatId, pending],
  );

  // Deep link: other pages can hand off to the assistant with `?prompt=…`
  // (e.g. "Diagnose with assistant" on a bounced message). It starts a NEW chat
  // seeded with that prompt. Run once, then strip the query so a refresh doesn't re-fire.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const pre = new URLSearchParams(window.location.search).get("prompt");
    if (pre?.trim()) {
      submit(pre);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasConversation = messages.length > 0;
  const out = credits ? isOutOfCredits(credits) : false;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Chat-history rail */}
      <aside className="flex flex-col gap-2">
        <Button variant="outline" className="w-full justify-start gap-2" onClick={newChat}>
          <Plus className="size-4" /> New chat
        </Button>
        <Card className="min-h-0 flex-1">
          <CardContent className="max-h-[60vh] space-y-1 overflow-y-auto p-2 lg:max-h-[calc(70vh-3rem)]">
            {chats.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No conversations yet. Ask the assistant something to start one.
              </p>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                    activeChatId === c.id ? "bg-secondary text-foreground" : "hover:bg-secondary/60",
                  )}
                >
                  {editingId === c.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        autoFocus
                        value={editValue}
                        maxLength={120}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(c.id);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => commitRename(c.id)}
                        aria-label="Save title"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        aria-label="Cancel rename"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openChat(c.id)}
                        className="min-w-0 flex-1 text-left"
                        title={c.title}
                      >
                        <span className="block truncate">{c.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{relativeTime(c.updated_at)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(c)}
                        aria-label={`Rename ${c.title}`}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChat(c.id)}
                        aria-label={`Delete ${c.title}`}
                        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Conversation */}
      <Card>
        <CardContent className="flex h-[70vh] flex-col gap-3 p-4">
          <div className="relative flex-1 overflow-hidden">
            <div ref={scrollRef} className="h-full space-y-3 overflow-y-auto pr-1 scroll-smooth">
              {!hasConversation ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-6" />
                  </div>
                  <p className="max-w-md text-sm text-muted-foreground">
                    I&apos;m your email operator — I can <strong className="font-medium text-foreground">build</strong>{" "}
                    sequences and campaigns, <strong className="font-medium text-foreground">operate</strong> (populate
                    lists, schedule sends), and <strong className="font-medium text-foreground">diagnose</strong> why a
                    message bounced. I work within your plan and role — I&apos;ll flag anything that needs an upgrade.
                  </p>
                  <div className="flex w-full max-w-lg flex-col gap-3">
                    {SUGGESTION_GROUPS.map((g) => (
                      <div key={g.label} className="flex flex-wrap items-center justify-center gap-2">
                        <span className="w-16 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {g.label}
                        </span>
                        {g.items.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => submit(s)}
                            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : loadingChat ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                messages.map((t) => (
                  <div
                    key={t.id}
                    id={`turn-${t.id}`}
                    className={cn("flex items-start gap-2 scroll-mt-2", t.role === "user" ? "flex-row-reverse" : "flex-row")}
                  >
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      {t.role === "user" ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    </span>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        t.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {t.role === "user" ? (
                        <p className="whitespace-pre-wrap">{t.content}</p>
                      ) : (
                        <Markdown>{t.content}</Markdown>
                      )}
                      {t.actions && t.actions.length > 0 ? (
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
              {pending ? (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-secondary px-3 py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              ) : null}
            </div>

            {/* In-chat navigation — a collapsible outline of the conversation's prompts. */}
            <ConversationOutline messages={messages} containerRef={scrollRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="border-t pt-3"
          >
            {credits ? <CreditNudge credits={credits} className="mb-2" /> : null}
            <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                ref={ref}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={out ? "Out of AI credits — add more to continue" : "Ask the assistant to do something…"}
                disabled={out}
                className="max-h-40 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={pending || !input.trim() || out}
                aria-label="Send"
                className="shrink-0"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 px-1">
              <p className="text-[11px] text-muted-foreground">
                <kbd className="rounded border bg-muted px-1 py-px font-sans text-[10px]">Enter</kbd> to send ·{" "}
                <kbd className="rounded border bg-muted px-1 py-px font-sans text-[10px]">Shift</kbd>
                <kbd className="ml-0.5 rounded border bg-muted px-1 py-px font-sans text-[10px]">Enter</kbd> for a new line
              </p>
              {credits ? <CreditMeter credits={credits} className="shrink-0" /> : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
