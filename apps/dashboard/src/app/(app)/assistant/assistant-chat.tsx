"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import {
  createChat,
  deleteChat,
  loadChat,
  sendChatMessage,
  type AssistantChat,
  type AssistantChatMessage,
} from "./actions";
import { ConversationOutline } from "./conversation-outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Grouped so the assistant's range — it builds, operates, AND diagnoses — is
// obvious the moment the page opens, not hidden behind a blank prompt box.
const SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Build", items: ["Set up a 3-step welcome sequence", "Create a launch email template"] },
  { label: "Operate", items: ["Add alex@acme.com to my Beta list", "Draft & schedule a launch announcement"] },
  { label: "Diagnose", items: ["Why did my recent emails bounce?", "Show my recent delivery status"] },
];

let tempCounter = 0;
const tempId = () => `tmp_${Date.now()}_${tempCounter++}`;

export function AssistantChat({ initialChats }: { initialChats: AssistantChat[] }) {
  const [chats, setChats] = useState<AssistantChat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [credits, setCredits] = useState<{ used: number; allowance: number } | null>(null);
  const [pending, startSend] = useTransition();
  const [loadingChat, setLoadingChat] = useState(false);

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
    if (ref.current) ref.current.value = "";
    ref.current?.focus();
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

  // Send a prompt into the active chat — lazily creating a chat on the first
  // message so empty chats never pile up. Optimistically renders the user turn.
  const submit = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text || pending) return;
      if (ref.current) ref.current.value = "";

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
        if (res.credits) setCredits(res.credits);
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
        // Refresh the rail so the title (derived from the first prompt) and order update.
        const id = chatId;
        setChats((cs) => {
          const moved = cs.find((c) => c.id === id);
          const rest = cs.filter((c) => c.id !== id);
          const now = new Date().toISOString();
          const title = moved && moved.title !== "New chat" ? moved.title : text.length > 60 ? `${text.slice(0, 57)}…` : text;
          return [{ object: "assistant_chat", id, title, created_at: moved?.created_at ?? now, updated_at: now }, ...rest];
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
                    onClick={() => removeChat(c.id)}
                    aria-label={`Delete ${c.title}`}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
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
                    className={cn("flex scroll-mt-2", t.role === "user" ? "justify-end" : "justify-start")}
                  >
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
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.actions.map((a, j) => (
                            <Badge key={j} variant={a.status < 400 ? "success" : "warning"} className="font-mono text-[10px]">
                              {a.tool} · {a.status}
                            </Badge>
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
              submit(ref.current?.value ?? "");
            }}
            className="flex items-end gap-2 border-t pt-3"
          >
            <Textarea
              ref={ref}
              rows={2}
              placeholder="Ask the assistant to do something…"
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(ref.current?.value ?? "");
                }
              }}
            />
            <Button type="submit" size="icon" disabled={pending} aria-label="Send">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
          {credits ? (
            <p className="text-right text-xs text-muted-foreground">
              AI credits: {credits.allowance === -1 ? "unlimited" : `${credits.used} / ${credits.allowance} used`}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
