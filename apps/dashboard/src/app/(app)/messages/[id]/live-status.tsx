"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  FlaskConical,
  Inbox,
  Loader2,
  MailCheck,
  MousePointerClick,
  Send,
  ShieldOff,
  Sparkles,
  RotateCw,
  UserX,
} from "lucide-react";
import { type MessageSnapshot, refreshMessage, retryMessage, simulateEvent } from "../actions";
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
  sent: { label: "Sent", tone: "progress", blurb: "Accepted by the mail provider — we'll show delivery here once it confirms." },
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

// Spinner + "live" pulse only while the send is genuinely in motion. "sent" is a
// SUCCESSFUL hand-off to the provider (a resting milestone), not a spinning state —
// otherwise it reads as "stuck" while awaiting an async delivery receipt.
const INFLIGHT = new Set(["queued", "sending", "retried"]);
// Polling stops only on a bad terminal state; through sent/delivered it keeps
// going (until the time cap) so the delivery receipt and the first open/click
// light up on their own.
const STOP = new Set(["bounced", "complained", "failed", "suppressed", "unsubscribed"]);

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

  // Happy path: Queued → Sent → Delivered → Opened → Clicked. Opened/clicked
  // live in the audit trail (engagement, not a message status), so read them
  // from there. A click implies an open even when the open pixel was blocked.
  const openedAt = t("opened");
  const clickedAt = t("clicked");
  let reached = { queued: 1, sending: 1, sent: 2, delivered: 3, retried: 1 }[s] ?? 1;
  if (clickedAt) reached = 5;
  else if (openedAt) reached = 4;
  const inflight = INFLIGHT.has(s);
  const happy: Omit<Stage, "state">[] = [
    { key: "queued", label: "Queued", icon: Inbox, at: t("queued") ?? message.created_at },
    { key: "sent", label: "Sent", icon: Send, at: t("sent") },
    { key: "delivered", label: "Delivered", icon: CheckCircle2, at: t("delivered") },
    { key: "opened", label: "Opened", icon: Eye, at: openedAt },
    { key: "clicked", label: "Clicked", icon: MousePointerClick, at: clickedAt },
  ];
  return happy.map((st, i) => ({
    ...st,
    state: i < reached ? "done" : inflight && i === reached ? "active" : "todo",
  }));
}

/**
 * Re-send a failed message.
 *
 * Deliberately not a confirm dialog: a message that failed never reached
 * anyone, so pressing this cannot do anything that needs undoing. The dangerous
 * case — a message the provider already accepted — is refused by the API and
 * never reaches this button, because the button only renders on `failed`.
 */
function RetryButton({ id, onUpdate }: { id: string; onUpdate: (s: MessageSnapshot) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const snap = await retryMessage(id);
          setBusy(false);
          if ("error" in snap) setError(snap.error);
          else onUpdate(snap);
        }}
        className={cn(buttonVariants({ size: "sm" }), "disabled:opacity-60")}
      >
        <RotateCw className={cn("mr-1.5 size-4", busy && "animate-spin")} />
        {busy ? "Sending again…" : "Try sending again"}
      </button>
      {error ? (
        // Verbatim: the API's refusal names the actual reason (already accepted,
        // now suppressed, quota), and a generic "couldn't retry" would hide it.
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
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
  // Bumped when a retry puts this message back in flight. The poll effect below
  // deliberately does NOT depend on `message.status` — it would tear down and
  // rebuild the interval on every hop — so a message that arrived here already
  // terminal needs an explicit nudge to start watching again.
  const [pollKey, setPollKey] = useState(0);

  const apply = useCallback((snap: Awaited<ReturnType<typeof refreshMessage>>) => {
    if ("message" in snap && snap.message) {
      setMessage(snap.message);
      setTrail(snap.trail);
      return snap.message.status;
    }
    return undefined;
  }, []);

  // Poll while more can still happen (delivery receipt, first open/click); stop
  // on a bad terminal state or after the ~6 minute cap.
  useEffect(() => {
    if (STOP.has(message.status)) return;
    // Each run gets its own budget. Without this a retry pressed more than six
    // minutes after the page loaded would start a poller that immediately hits
    // the cap and stops — leaving the screen frozen on "Sending" while the send
    // has long since finished. That is exactly how this broke.
    startedAt.current = Date.now();
    // The cap must count time we were actually WATCHING. A tab left in the
    // background still burns the six minutes while deliberately not polling, so
    // a user who looked away and came back would find a frozen screen and no way
    // to tell it apart from a stuck send. Hidden time is not spent.
    let hiddenSince: number | null = document.hidden ? Date.now() : null;

    const tick = async () => {
      if (document.hidden) return; // don't poll a backgrounded tab
      if (Date.now() - startedAt.current > 6 * 60_000) return void stop();
      const next = apply(await refreshMessage(id));
      if (next && STOP.has(next)) stop();
    };

    const iv = setInterval(tick, 4000);
    const stop = () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      // Credit back the time we spent not looking, then check immediately rather
      // than making someone stare at a stale status for another four seconds.
      if (hiddenSince !== null) {
        startedAt.current += Date.now() - hiddenSince;
        hiddenSince = null;
      }
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pollKey]);

  // The headline reflects the furthest thing that happened: engagement (from the
  // trail) outranks the stored status, which caps at "delivered".
  const displayStatus = timeOf(trail, "clicked") ? "clicked" : timeOf(trail, "opened") ? "opened" : message.status;
  const meta = STATUS_META[displayStatus] ?? STATUS_META.queued;
  const stages = stagesFor(message, trail);
  const live = INFLIGHT.has(message.status);
  // A sandbox send is simulated — UNLESS it went to a reserved test recipient,
  // which takes the real provider path even from the sandbox. Those get a real
  // outcome from the provider, so neither the "didn't go anywhere" note nor the
  // lifecycle simulator applies to them.
  const simulated = message.sandbox && !message.test_recipient;
  const errorish = meta.tone === "error" || meta.tone === "warn";
  const HeadIcon = EVENT_ICON[displayStatus] ?? Inbox;

  // The FULL trail, newest last — including the machine steps (queued, sending,
  // retried) that the headline tracker abstracts away. Folded up by default:
  // the tracker above already tells the story, and this is what you open when
  // the story isn't enough.
  const timeline = trail;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {simulated ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Sandbox send.</span> This was rendered and recorded but never handed to a provider — it reached no one. Use it to try the delivery lifecycle.
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
            {message.retry_count > 0 ? (
              // The status column is the CURRENT state, so without this a message
              // delivered on the second attempt reads exactly like one that never
              // failed. Analytics and reputation still count it once — this is
              // only the history, put back on screen.
              <p className="mt-1 text-xs text-muted-foreground">
                Re-sent {message.retry_count === 1 ? "once" : `${message.retry_count} times`} after
                a failure — see the full history below.
              </p>
            ) : null}
          </div>
        </div>

        {/* Stage tracker */}
        <Tracker stages={stages} />

        {message.status === "sent" ? (
          <p className="text-xs text-muted-foreground">
            Delivery, opens, and bounces appear here automatically as your mail provider reports them back.
          </p>
        ) : null}

        {/* Try again — only for a send that never left our system. The API is the
            authority on whether it may be retried, and refuses anything the
            provider already accepted; this just shows what it said. */}
        {message.status === "failed" ? (
          <RetryButton
            id={id}
            onUpdate={(snap) => {
              apply(snap);
              // Back in flight — start watching again, with a fresh time budget.
              setPollKey((k) => k + 1);
            }}
          />
        ) : null}

        {/* Diagnose (only when something went wrong) */}
        {errorish ? (
          <Link
            href={`/assistant?prompt=${encodeURIComponent(`Why did the email to ${message.to} ${message.status}? (message id ${message.id}) Explain the cause in plain terms and how to fix it.`)}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Sparkles className="mr-1.5 size-4" /> Ask the assistant what happened
          </Link>
        ) : null}

        {/* The full trail, on demand. */}
        {timeline.length > 0 ? <ActivityTrail entries={timeline} /> : null}

        {simulated ? <SimulatePanel id={id} onUpdate={apply} status={message.status} /> : null}
      </CardContent>
    </Card>
  );
}

/**
 * Every step this email actually went through — the machine ones included.
 *
 * The tracker above answers "where is it?"; this answers "what happened, and
 * who did it?", which is only ever asked when something looks wrong. So it's
 * folded away by default and carries the detail the tracker deliberately drops:
 * the provider that handled it, the reason a bounce gave, the URL that was
 * clicked, and whether an event came from the provider or was simulated.
 */
function ActivityTrail({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="flex">
          <ChevronRight className="size-3.5" />
        </motion.span>
        Activity
        <span className="font-normal normal-case tracking-normal">· {entries.length} step{entries.length === 1 ? "" : "s"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-0">
              {entries.map((e, i) => {
                const m = STATUS_META[e.event];
                const Icon = EVENT_ICON[e.event] ?? Inbox;
                const reason =
                  typeof e.metadata?.reason === "string"
                    ? e.metadata.reason
                    : typeof e.metadata?.url === "string"
                      ? e.metadata.url
                      : typeof e.metadata?.error === "string"
                        ? e.metadata.error
                        : undefined;
                // Where the step came from, in the user's words.
                const source = e.metadata?.simulated === true
                  ? "simulated"
                  : e.provider
                    ? `via ${e.provider}`
                    : e.actor && e.actor !== "system"
                      ? e.actor
                      : null;
                return (
                  <li key={`${e.event}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
                    {/* The connecting spine — a trail, not a list. */}
                    {i < entries.length - 1 ? (
                      <span className="absolute left-[7px] top-5 h-full w-px bg-border" aria-hidden />
                    ) : null}
                    <span className={cn("relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center", m ? TONE_TEXT[m.tone] : "text-muted-foreground")}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{m?.label ?? e.event}</span>
                        {source ? <span className="text-[11px] text-muted-foreground">{source}</span> : null}
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground" title={absTime(e.timestamp)}>
                          {relTime(e.timestamp)}
                        </span>
                      </div>
                      {reason ? <p className="mt-0.5 break-all text-xs text-muted-foreground">{reason}</p> : null}
                    </div>
                  </li>
                );
              })}
            </div>
          </motion.ol>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Tracker({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex items-start">
      {stages.map((st, i) => {
        const tone: Tone = st.state === "done" || st.state === "active" ? (["delivered", "opened", "clicked"].includes(st.key) ? "success" : "progress") : st.state === "error" ? "error" : st.state === "warn" ? "warn" : "muted";
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
