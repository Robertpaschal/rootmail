"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
import { ScrubbableLine, type ScrubEvent, type Station } from "@rootmail/design";
import { stationsFor } from "@/components/app/message-flow";
import { type MessageSnapshot, refreshMessage, retryMessage, simulateEvent } from "../actions";
import type { SimulatableEvent } from "@/lib/rootmail";
import type { AuditEntry, Message } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { operatorReason } from "@/lib/provider-copy";
import { cn } from "@/lib/utils";

// Everyday-user view of a send: a status headline + a stage tracker that advances
// on its own (polls while in flight), a plain-language timeline, and — only for a
// sandbox/test send — the lifecycle simulator. No provider IDs or jargon here;
// those live under "Developer details" on the page.

/**
 * `inferred` is a tone in its own right, and it exists because `opened` and
 * `clicked` were sharing `success` with `delivered` — drawing a guess in the
 * same colour and weight as a provider confirmation. That is the industry's
 * founding lie (`docs/design/00-PHILOSOPHY.md` §1) and it was shipping here, on
 * the one page whose entire job is to say what actually happened.
 */
type Tone = "progress" | "success" | "inferred" | "error" | "warn" | "muted";

const STATUS_META: Record<string, { label: string; tone: Tone; blurb: string }> = {
  queued: { label: "Queued", tone: "progress", blurb: "Your email is in line to send." },
  sending: { label: "Sending", tone: "progress", blurb: "Handing your email to the mail servers…" },
  sent: { label: "Sent", tone: "progress", blurb: "Accepted by the mail provider — we'll show delivery here once it confirms." },
  delivered: { label: "Delivered", tone: "success", blurb: "It landed in the recipient's inbox." },
  opened: {
    label: "Opened",
    tone: "inferred",
    blurb:
      "A tracking pixel in this email loaded — which usually means someone opened it. Mail clients pre-load images, so we cannot be certain, and we do not count it as confirmed.",
  },
  clicked: {
    label: "Clicked",
    tone: "inferred",
    blurb:
      "A link in this email was requested. Some security scanners follow links before a person sees them, so this is strong evidence rather than proof.",
  },
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

// Colour asserts STATE or it is ink (docs/design/00-PHILOSOPHY.md §5.2). There
// is no "progress" colour, deliberately: in flight is a thing we have not
// witnessed yet, and the system draws that as ink, not as a fourth signal.
const TONE_TEXT: Record<Tone, string> = {
  progress: "text-ink-muted",
  success: "text-witnessed",
  // Muted ink, never a signal colour: an inference does not get to look like an
  // observation. It reads the same way the hollow station on the line does.
  inferred: "text-ink-muted",
  error: "text-stopped",
  warn: "text-acted",
  muted: "text-muted-foreground",
};
const TONE_DOT: Record<Tone, string> = {
  progress: "bg-ink text-background",
  success: "bg-witnessed text-white",
  // Hollow, matching the hollow node — outline, not fill.
  inferred: "border border-ink/40 bg-transparent text-ink-muted",
  error: "bg-stopped text-white",
  warn: "bg-acted text-white",
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

/**
 * What each station KNOWS, index-aligned with `stationsFrom`.
 *
 * The method is not decoration — it is the sourcing line (§5.3). "Delivered"
 * and "Opened" are not the same kind of fact, and printing where each one came
 * from is the difference between a record and a dashboard.
 */
function eventsFrom(message: Message, stations: Station[], trail: AuditEntry[]): ScrubEvent[] {
  // §5.4 wants the EXACT time here — the row above already carries the relative
  // one — but exact is not the same as raw. A bare ISO string with milliseconds
  // is a log line, not a record somebody reads.
  const exact = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };
  const t = (ev: string) => exact(timeOf(trail, ev));
  const method: Record<string, string> = {
    Queued: "accepted by the API",
    Sent: "handed to the provider",
    Delivered: "confirmed by the provider",
    Opened: "tracking pixel · undercounts blocked images",
    Clicked: "link redirect",
  };
  return stations.map((st) => {
    if (st.state === "stopped") {
      return {
        at: t(message.status),
        method: "provider feedback",
        detail: operatorReason(message.error) ?? undefined,
      };
    }
    return { at: t(st.label.toLowerCase()) ?? undefined, method: method[st.label] };
  });
}

/**
 * The message's stations, with the real timestamps out of the audit trail.
 *
 * The row in `/messages` and this page MUST draw the same line, so the station
 * shapes come from one place (`stationsFor`) and this only supplies the times
 * and the in-flight flag that a list row has no way to know.
 */
function stationsFrom(message: Message, trail: AuditEntry[]): Station[] {
  const t = (ev: string) => timeOf(trail, ev);
  const stations = stationsFor(message, {
    sentAt: t("sent") ?? null,
    deliveredAt: t("delivered") ?? null,
  });
  const at: Record<string, string | undefined> = {
    Queued: t("queued") ?? message.created_at,
    Sent: t("sent"),
    Delivered: t("delivered"),
    Opened: t("opened"),
    Clicked: t("clicked"),
  };
  return stations.map((st) => {
    const stamp = st.state === "stopped" ? t(message.status) : at[st.label];
    return { ...st, at: stamp ? relTime(stamp) : st.at };
  });
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
        <p className="text-sm text-stopped" role="alert">
          {operatorReason(error) ?? error}
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
  const stations = stationsFrom(message, trail);
  const live = INFLIGHT.has(message.status);
  // A sandbox send is simulated — UNLESS it went to a reserved test recipient,
  // which takes the real provider path even from the sandbox. Those get a real
  // outcome from the provider, so neither the "didn't go anywhere" note nor the
  // lifecycle simulator applies to them.
  const simulated = message.sandbox && !message.test_recipient;
  const errorish = meta.tone === "error" || meta.tone === "warn";
  const HeadIcon = EVENT_ICON[displayStatus] ?? Inbox;

  // The FULL trail, newest last — including the machine steps (queued, sending,
  // retried) that the line abstracts away. Always rendered: the line is an
  // enhancement over readable content, not a replacement for it.
  const timeline = trail;

  return (
    // NOT a card. The send record is the SPINE of this page — the thing the
    // page is about — and boxing it made it one widget of two, sitting above a
    // second box of equal weight. It sits directly on the ground now, under the
    // page's own rule, with the email itself beside it.
    <div>
      <h2 className="border-b border-ink/20 pb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        The record
      </h2>
      <div className="space-y-5 pt-5">
        {simulated ? (
          // A sandbox send is not an intervention and not a failure, so it gets
          // no signal colour — a dashed rule, which is what "we did not do this
          // for real" looks like everywhere else in this system.
          <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 px-3.5 py-2.5 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
              {live ? <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[12.5px] font-medium text-muted-foreground" data-fact><span className="size-1.5 animate-throb rounded-full bg-ink-muted motion-reduce:animate-none" /> watching</span> : null}
            </div>
            <p className="text-sm text-muted-foreground">{meta.blurb}</p>
            {errorish && operatorReason(message.error) ? <p className="mt-1 text-sm text-muted-foreground">Reason: <span className="text-foreground">{operatorReason(message.error)}</span></p> : null}
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

        {/* The line. Five stations, and the rendering law is the honesty
            policy: `Opened` is a tracking pixel firing, so it is drawn hollow —
            never in the same weight as a provider's delivery confirmation. A
            bounce severs the line where it stopped rather than deleting it. */}
        {/* §5.4 — the line IS the trail, and reading it is dragging along it.
            Hover or arrow-key between stations; the record below is always
            rendered, so nothing here depends on a frame ever animating. */}
        <div className="overflow-x-auto pb-1">
          <ScrubbableLine
            stations={stations}
            events={eventsFrom(message, stations, trail)}
            scale="page"
          >
            {timeline.length > 0 ? <ActivityTrail entries={timeline} /> : null}
          </ScrubbableLine>
        </div>

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

        {simulated ? <SimulatePanel id={id} onUpdate={apply} status={message.status} /> : null}
      </div>
    </div>
  );
}

/**
 * Every step this email actually went through — the machine ones included.
 *
 * The line above answers "where is it?"; this answers "what happened, and who
 * did it?", with the detail the line deliberately drops: the provider that
 * handled it, the reason a bounce gave, the URL that was clicked, and whether
 * an event came from the provider or was simulated.
 *
 * It used to be folded behind a disclosure. It is not any more, and that is a
 * rule rather than a preference (docs/design/00-PHILOSOPHY.md §5.4): the line
 * is an ENHANCEMENT over content that is already readable, never the mechanism
 * by which the record becomes readable. A record you have to open is a record
 * somebody can say they never saw.
 */
function ActivityTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="border-t pt-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Activity
        <span className="font-mono font-normal normal-case tracking-normal" data-fact>
          · {entries.length} step{entries.length === 1 ? "" : "s"}
        </span>
      </p>

      <ol className="mt-3 space-y-0">
        {entries.map((e, i) => {
          const m = STATUS_META[e.event];
          const Icon = EVENT_ICON[e.event] ?? Inbox;
          const reason =
            typeof e.metadata?.url === "string"
              ? e.metadata.url
              : operatorReason(
                  typeof e.metadata?.reason === "string"
                    ? e.metadata.reason
                    : typeof e.metadata?.error === "string"
                      ? e.metadata.error
                      : undefined,
                ) ?? undefined;
          // Where the step came from, in the user's words.
          const source =
            e.metadata?.simulated === true
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
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center",
                  m ? TONE_TEXT[m.tone] : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{m?.label ?? e.event}</span>
                  {source ? <span className="text-[12.5px] text-muted-foreground">{source}</span> : null}
                  <span
                    className="ml-auto shrink-0 font-mono text-xs text-muted-foreground"
                    data-fact
                    title={absTime(e.timestamp)}
                  >
                    {relTime(e.timestamp)}
                  </span>
                </div>
                {reason ? (
                  <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground" data-fact>
                    {reason}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
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
