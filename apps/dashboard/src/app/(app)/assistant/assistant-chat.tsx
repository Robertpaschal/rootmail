"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { askAssistant } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  text: string;
  actions?: { tool: string; status: number }[];
}

// Grouped so the assistant's range — it builds, operates, AND diagnoses — is
// obvious the moment the page opens, not hidden behind a blank prompt box.
const SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Build", items: ["Set up a 3-step welcome sequence", "Create a launch email template"] },
  { label: "Operate", items: ["Add alex@acme.com to my Beta list", "Draft & schedule a launch announcement"] },
  { label: "Diagnose", items: ["Why did my recent emails bounce?", "Show my recent delivery status"] },
];

export function AssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [credits, setCredits] = useState<{ used: number; allowance: number } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const didInit = useRef(false);

  const submit = (prompt: string) => {
    if (!prompt.trim() || pending) return;
    setTurns((t) => [...t, { role: "user", text: prompt }]);
    if (ref.current) ref.current.value = "";
    start(async () => {
      const res = await askAssistant(prompt);
      if (res.credits) setCredits(res.credits);
      setTurns((t) => [
        ...t,
        { role: "assistant", text: res.error ?? res.reply ?? "Done.", actions: res.actions },
      ]);
    });
  };

  // Deep link: other pages can hand off to the assistant with `?prompt=…`
  // (e.g. "Diagnose with assistant" on a bounced message). Run it once, then
  // strip the query so a refresh doesn't re-fire it.
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

  return (
    <Card>
      <CardContent className="flex h-[70vh] flex-col gap-3 p-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {turns.length === 0 ? (
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
          ) : (
            turns.map((t, i) => (
              <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    t.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary",
                  )}
                >
                  <p className="whitespace-pre-wrap">{t.text}</p>
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
  );
}
