"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FlaskConical,
  Inbox,
  Loader2,
  MailCheck,
  MousePointerClick,
  Send,
  ShieldOff,
  Sparkles,
  UserX,
} from "lucide-react";
import { refreshMessage, simulateEvent } from "../actions";
import type { SimulatableEvent } from "@/lib/rootmail";
import type { AuditEntry, Message } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Everyday-user view of a send: a status headline + a stage tracker that advances
// on its own (polls while in flight), a plain-language timeline, and — only for a
// sandbox/test send — the lifecycle simulator. No provider IDs or jargon here;
// those live under "Developer details" on the page.

type Tone = "progress" | "success" | "error" | "warn" | "muted";

const STATUS_META: Record<string, { label: string; tone: Tone; blurb: string }> = {
  queued: { label: "Queued", tone: "progress", blurb: "Your email is in line to send." },
  sending: { label: "Sending", tone: "progress", blurb: "Handing your email to the mail servers…" },
  sent: { label: "Sent", tone: "progress", blurb: "On its way — waiting for the inbox to confirm delivery." },
  delivered: { label: "Delivered", tone: "success", blurb: "It landed in the recipient's inbox." },
  opened: { label: "Opened", tone: "success", blurb: "The recipient opened your email." },
  clicked: { label: "Clicked", tone: "success", blurb: "The recipient clicked a link in your email." },
  bounced: { label: "Bounced", tone: "error", blurb: "The address couldn't receive it." },
  complained: { label: "Marked as spam", tone: "warn", blurb: "The recipient reported this as spam." },
  failed: { label: "Couldn't send", tone: "error", blurb: "Something went wrong while sending." },
  suppressed: { label: "Not sent", tone: "muted", blurb: "The recipient is on your suppression list." },
  unsubscribed: { label: "Unsubscribed", tone: "muted", blurb: "The recipient unsubscribed." },
  retried: { label: "Retrying", tone: "progress", blurb: "Trying again after a brief hiccup…" },
};

const EVENT_ICON: Record<string, typeof Inbox> = {
  queued: Inbox,
  sending: Send,
  sent: Send,
  delivered: MailCheck,
  opened: Eye,
  clicked: MousePointerClick,
  bounced: AlertTriangle,
  complained: AlertTriangle,
  failed: AlertTriangle,
  suppressed: ShieldOff,
  unsubscribed: UserX,
  retried: Loader2,
};

// Still moving → keep polling. Settled → stop (the tracker has reached a resting state).
const INFLIGHT = new Set(["queued", "sending", "sent", "retried"]);
const SETTLED = new Set(["delivered", "opened", "clicked", "bounced", "complained", "failed", "suppressed", "unsubscribed"]);

const TONE_TEXT: Record<Tone, string> = {
  progress: "text-blue-600 dark:text-blue-400",
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-rose-600 dark:text-rose-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
};
const TONE_DOT: Record<Tone, string> = {
  progress: "bg-blue-500 text-white",
  success: "bg-emerald-500 text-white",
  error: "bg-rose-500 text-white",
  warn: "bg-amber-500 text-white",
  muted: "bg-muted-foreground/60 text-white",
};

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** First timestamp for an event in the trail (events are chronological). */
function timeOf(trail: AuditEntry[], event: string): string | undefined {
  return trail.find((e) => e.event === event)?.timestamp;
}

interface Stage {
  key: string;
  label: string;
  icon: typeof Inbox;
  state: "done" | "active" | "todo" | "error" | "warn";
  at?: string;
}

function stagesFor(message: Message, trail: AuditEntry[]): Stage[] {
  const s = message.status;
  const t = (ev: string) => timeOf(trail, ev);
  const Q: Stage = { key: "queued", label: "Queued", icon: Inbox, state: "done", at: t("queued") ?? message.created_at };
  const Sent: Stage = { key: "sent", label: "Sent", icon: Send, state: "done", at: t("sent") };
  const Del: Stage = { key: "delivered", label: "Delivered", icon: MailCheck, state: "done", at: t("delivered") };

  // Terminal / error variants replace the happy path end.
  if (s === "suppressed") return [Q, { key: "suppressed", label: "Not sent", icon: ShieldOff, state: "warn", at: t("suppressed") }];
  if (s === "failed") return [Q, { key: "failed", label: "Couldn't send", icon: AlertTriangle, state: "error", at: t("failed") }];
  if (s === "bounced") return [Q, Sent, { key: "bounced", label: "Bounced", icon: AlertTriangle, state: "error", at: t("bounced") }];
  if (s === "complained") return [Q, Sent, Del, { key: "complained", label: "Marked as spam", icon: AlertTriangle, state: "warn", at: t("complained") }];

  // Happy path: Queued → Sent → Delivered → Opened.
  const reached = { queued: 1, sending: 1, sent: 2, delivered: 3, opened: 4, clicked: 4, retried: 1 }[s] ?? 1;
  const inflight = INFLIGHT.has(s);
  const happy: Omit<Stage, "state">[] = [
    { key: "queued", label: "Queued", icon: Inbox, at: t("queued") ?? message.created_at },
    { key: "sent", label: "Sent", icon: Send, at: t("sent") },
    { key: "delivered", label: "Delivered", icon: CheckCircle2, at: t("delivered") },
    { key: "opened", label: "Opened", icon: Eye, at: t("opened") },
  ];
  return happy.map((st, i) => ({
    ...st,
    state: i < reached ? "done" : inflight && i === reached ? "active" : "todo",
  }));
}

export function LiveStatus({
  id,
  initialMessage,
  initialTrail,
}: {
  id: string;
  initialMessage: Message;
  initialTrail: AuditEntry[];
}) {
  const [message, setMessage] = useState(initialMessage);
  const [trail, setTrail] = useState(initialTrail);
  const startedAt = useRef(Date.now());

  const apply = useCallback((snap: Awaited<ReturnType<typeof refreshMessage>>) => {
    if ("message" in snap && snap.message) {
      setMessage(snap.message);
      setTrail(snap.trail);
      return snap.message.status;
    }
    return undefined;
  }, []);

  // Poll while the send is still moving; stop once it settles or after ~6 minutes.
  useEffect(() => {
    if (SETTLED.has(message.status)) return;
    const iv = setInterval(async () => {
      if (document.hidden) return; // don't poll a backgrounded tab
      if (Date.now() - startedAt.current > 6 * 60_000) return void clearInterval(iv);
      const next = apply(await refreshMessage(id));
      if (next && SETTLED.has(next)) clearInterval(iv);
    }, 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const meta = STATUS_META[message.status] ?? STATUS_META.queued;
  const stages = stagesFor(message, trail);
  const live = INFLIGHT.has(message.status);
  const sandbox = message.sandbox;
  const errorish = meta.tone === "error" || meta.tone === "warn";
  const HeadIcon = EVENT_ICON[message.status] ?? Inbox;

  // A concise, human timeline (no actor ids / provider metadata).
  const timeline = trail.filter((e) => STATUS_META[e.event] && e.event !== "sending");

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {sandbox ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Test send.</span> This didn&apos;t go to a real inbox — it&apos;s a sandbox message for previewing and trying the delivery lifecycle.
            </p>
          </div>
        ) : null}

        {/* Headline */}
        <div className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONE_DOT[meta.tone])}>
            {live ? <Loader2 className="size-5 animate-spin" /> : <HeadIcon className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={cn("text-lg font-semibold", TONE_TEXT[meta.tone])}>{meta.label}</h2>
              {live ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400"><span className="size-1.5 animate-pulse rounded-full bg-blue-500" /> live</span> : null}
            </div>
            <p className="text-sm text-muted-foreground">{meta.blurb}</p>
            {errorish && message.error ? <p className="mt-1 text-sm text-muted-foreground">Reason: <span className="text-foreground">{message.error}</span></p> : null}
          </div>
        </div>

        {/* Stage tracker */}
        <Tracker stages={stages} />

        {/* Diagnose (only when something went wrong) */}
        {errorish ? (
          <Link
            href={`/assistant?prompt=${encodeURIComponent(`Why did the email to ${message.to} ${message.status}? (message id ${message.id}) Explain the cause in plain terms and how to fix it.`)}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Sparkles className="mr-1.5 size-4" /> Ask the assistant what happened
          </Link>
        ) : null}

        {/* Plain-language timeline */}
        {timeline.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Activity</p>
            <ol className="space-y-2.5">
              {timeline.map((e, i) => {
                const m = STATUS_META[e.event];
                const Icon = EVENT_ICON[e.event] ?? Inbox;
                const reason = typeof e.metadata?.reason === "string" ? e.metadata.reason : undefined;
                return (
                  <li key={`${e.event}-${i}`} className="flex items-center gap-2.5 text-sm">
                    <Icon className={cn("size-4 shrink-0", TONE_TEXT[m.tone])} />
                    <span className="font-medium">{m.label}</span>
                    {reason ? <span className="truncate text-muted-foreground">· {reason}</span> : null}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={absTime(e.timestamp)}>{relTime(e.timestamp)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {sandbox ? <SimulatePanel id={id} onUpdate={apply} status={message.status} /> : null}
      </CardContent>
    </Card>
  );
}

function Tracker({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex items-start">
      {stages.map((st, i) => {
        const tone: Tone = st.state === "done" || st.state === "active" ? (st.key === "delivered" || st.key === "opened" ? "success" : "progress") : st.state === "error" ? "error" : st.state === "warn" ? "warn" : "muted";
        const filled = st.state === "done" || st.state === "active" || st.state === "error" || st.state === "warn";
        return (
          <div key={st.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : st.state === "todo" ? "bg-border" : "bg-primary/40")} />
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors", filled ? cn(TONE_DOT[tone], "border-transparent") : "border-border bg-card text-muted-foreground")}>
                {st.state === "active" ? <Loader2 className="size-4 animate-spin" /> : <st.icon className="size-4" />}
              </span>
              <span className={cn("h-0.5 flex-1", i === stages.length - 1 ? "opacity-0" : stages[i + 1].state === "todo" ? "bg-border" : "bg-primary/40")} />
            </div>
            <span className={cn("mt-1.5 text-xs font-medium", st.state === "todo" ? "text-muted-foreground" : TONE_TEXT[tone])}>{st.label}</span>
            {st.at ? <span className="text-[11px] text-muted-foreground">{relTime(st.at)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

const SIMULATE: { event: SimulatableEvent; label: string }[] = [
  { event: "delivered", label: "Delivered" },
  { event: "opened", label: "Opened" },
  { event: "clicked", label: "Clicked" },
  { event: "bounced", label: "Bounced" },
  { event: "complained", label: "Spam complaint" },
];

function SimulatePanel({ id, status, onUpdate }: { id: string; status: string; onUpdate: (snap: Awaited<ReturnType<typeof refreshMessage>>) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (event: SimulatableEvent) => {
    setBusy(event);
    onUpdate(await simulateEvent(id, event));
    setBusy(null);
  };
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3.5">
      <p className="text-sm font-medium">Try the delivery lifecycle</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Simulate what a real provider would report. Bounces and complaints also add the recipient to your suppression list — just like production.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SIMULATE.map((s) => (
          <button
            key={s.event}
            type="button"
            onClick={() => run(s.event)}
            disabled={busy !== null || status === s.event}
            className={cn("inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50")}
          >
            {busy === s.event ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
