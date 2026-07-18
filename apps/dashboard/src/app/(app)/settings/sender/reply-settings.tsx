"use client";

import { useState, useTransition } from "react";
import { Check, Inbox, Loader2, MailCheck } from "lucide-react";
import { updateReplyMode } from "./actions";
import { cn } from "@/lib/utils";

type Mode = "inbox" | "own_mailbox";

const OPTIONS: { id: Mode; title: string; desc: string; Icon: typeof Inbox }[] = [
  {
    id: "inbox",
    title: "Bring replies into rootmail",
    desc: "When someone replies, it lands in your Replies inbox as a conversation with that person — read and answer it right here. Nothing disappears into a no-reply void.",
    Icon: Inbox,
  },
  {
    id: "own_mailbox",
    title: "Send replies to my own mailbox",
    desc: "Replies go straight to your own address, so you handle them in Gmail, Outlook, or wherever you read email. Your Replies inbox stays empty.",
    Icon: MailCheck,
  },
];

export function ReplySettings({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (m: Mode) => {
    if (m === mode || pending) return;
    const prev = mode;
    setMode(m);
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateReplyMode(m);
      if (res.error) {
        setMode(prev);
        setError(res.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = o.id === mode;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/50",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("grid size-8 place-items-center rounded-md", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <o.Icon className="size-4" />
                </span>
                <span className="text-sm font-medium">{o.title}</span>
                {active ? <Check className="ml-auto size-4 text-primary" /> : null}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{o.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {pending ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" /> Saving…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        ) : (
          <span>Replies come in on a secure rootmail address today — your own domain is coming for verified domains.</span>
        )}
        {error ? <span className="text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
