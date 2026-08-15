"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  Check,
  CornerUpLeft,
  Image as ImageIcon,
  MousePointer2,
  Send,
  Sparkles,
  Type,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Carousel, type Slide } from "./carousel";
import { Reveal } from "./motion";
import { cn } from "@/lib/utils";

/**
 * "A look inside" — the product, moving.
 *
 * The site described rootmail thoroughly and never once SHOWED it. Twelve
 * feature cards is a specification; this is the thing itself, playing on a
 * loop, so a visitor can see what an hour in the app looks like before they
 * sign up for it.
 *
 * These are stylised recreations of the real screens, drawn in the DOM rather
 * than screenshotted — they stay honest as the app changes, they're readable
 * on a phone, and they weigh nothing. The sample data is obviously sample
 * data: no invented customer names, no invented traction, no numbers that
 * imply a scale we're claiming.
 *
 * Every animation here is decoration on top of a screen that already reads
 * correctly standing still (see the note in tailwind.config.ts). `active` is
 * threaded through so motion only runs on the slide you're looking at.
 */

// ---------------------------------------------------------------------------
// The frame everything sits in.
// ---------------------------------------------------------------------------
function Screen({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
      <div className="flex items-center gap-2 border-b bg-secondary/40 px-3 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-rose-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="mx-auto rounded-md bg-background/70 px-3 py-0.5 font-mono text-[10px] text-muted-foreground">
          {path}
        </span>
      </div>
      <div className="min-h-[320px] p-4 sm:min-h-[360px] sm:p-6">{children}</div>
    </div>
  );
}

/** A pane heading inside a screen. */
function Pane({ icon: Icon, title, children, className }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-background/60 p-3", className)}>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </p>
      {children}
    </div>
  );
}

/** The light that travels across a surface — the "this is live" tell. */
function Sweep({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
      <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1 — Design
// ---------------------------------------------------------------------------
function StudioScene({ active }: { active: boolean }) {
  const blocks = [
    { icon: ImageIcon, label: "Header image", h: "h-12" },
    { icon: Type, label: "“Your order is on its way”", h: "h-6" },
    { icon: Type, label: "Two lines of body copy", h: "h-10" },
  ];
  return (
    <Screen path="app.rootmail.io/templates/order-shipped">
      <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
        <div className="relative rounded-xl border bg-background p-4">
          <Sweep active={active} />
          <div className="mx-auto max-w-sm space-y-2.5">
            {blocks.map((b) => (
              <div
                key={b.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-dashed px-3 text-xs text-muted-foreground",
                  b.h,
                )}
              >
                <b.icon className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{b.label}</span>
              </div>
            ))}
            {/* The block being dropped in right now. */}
            <div
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-xs font-medium text-primary-foreground",
                active && "animate-pulse-ring",
              )}
            >
              Track your parcel
            </div>
          </div>
          <MousePointer2
            className={cn(
              "absolute bottom-8 right-10 size-5 fill-foreground text-background",
              active && "animate-bob",
            )}
            aria-hidden="true"
          />
        </div>
        <Pane icon={Type} title="Blocks" className="hidden sm:block">
          <div className="space-y-1.5">
            {["Text", "Image", "Button", "Divider", "Columns"].map((t) => (
              <div key={t} className="rounded-md bg-secondary/70 px-2 py-1.5 text-[11px]">
                {t}
              </div>
            ))}
          </div>
        </Pane>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Drag blocks onto the canvas. No HTML, no template language — and it looks the same in
        every inbox.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 2 — Audience
// ---------------------------------------------------------------------------
function AudienceScene({ active }: { active: boolean }) {
  const people = [
    { name: "A. Bello", tags: ["customer", "lagos"] },
    { name: "C. Duarte", tags: ["customer"] },
    { name: "E. Fischer", tags: ["trial"] },
    { name: "G. Haruna", tags: ["customer", "vip"] },
  ];
  return (
    <Screen path="app.rootmail.io/contacts">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {["customer", "vip", "trial"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              i === 0
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "text-muted-foreground",
              i === 0 && active && "animate-pulse-ring",
            )}
          >
            {t}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">3</span> of 4 match
        </span>
      </div>
      <div className="relative divide-y overflow-hidden rounded-xl border">
        <Sweep active={active} />
        {people.map((p) => {
          const match = p.tags.includes("customer");
          return (
            <div
              key={p.name}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm transition-opacity",
                match ? "bg-background" : "bg-muted/30 opacity-45",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {p.name[0]}
              </span>
              <span className="font-medium">{p.name}</span>
              <span className="ml-auto flex gap-1">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </span>
              {match ? <Check className="size-4 shrink-0 text-emerald-500" /> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Tag people the way you actually think about them, then send to a tag. Anyone who opted out
        is dropped before the send — you can&apos;t email them by accident.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 3 — Delivery
// ---------------------------------------------------------------------------
function DeliveryScene({ active }: { active: boolean }) {
  const bars = [
    { label: "Sent", pct: 100, cls: "bg-blue-400", n: "1,240" },
    { label: "Delivered", pct: 98, cls: "bg-emerald-500", n: "1,215" },
    { label: "Opened", pct: 46, cls: "bg-violet-500", n: "573" },
    { label: "Clicked", pct: 14, cls: "bg-blue-600", n: "174" },
  ];
  return (
    <Screen path="app.rootmail.io/campaigns/spring-restock">
      <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
        <div className="relative rounded-xl border bg-background/60 p-4">
          <Sweep active={active} />
          <div className="space-y-3">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-medium">{b.label}</span>
                  <span className="tabular-nums text-muted-foreground">{b.n}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  {/* Width is a real style, not an animation target — the chart
                      is correct the instant it paints. */}
                  <div className={cn("h-full rounded-full", b.cls)} style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Pane icon={BarChart3} title="Reputation">
            <div className="flex items-end gap-1.5">
              <span className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                94
              </span>
              <span className="pb-1 text-xs text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Healthy — keep it up.</p>
          </Pane>
          <Pane icon={Check} title="Your domain">
            <div className="space-y-1.5 text-[11px]">
              {["SPF", "DKIM", "DMARC"].map((r) => (
                <p key={r} className="flex items-center gap-1.5">
                  <Check className="size-3 text-emerald-500" /> {r} verified
                </p>
              ))}
            </div>
          </Pane>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Sent, delivered, opened, clicked — per campaign and per email in a series. Plus a live score
        for whether you&apos;re landing in the inbox at all.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 4 — Replies
// ---------------------------------------------------------------------------
function RepliesScene({ active }: { active: boolean }) {
  return (
    <Screen path="app.rootmail.io/replies">
      <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
        <div className="hidden space-y-1.5 sm:block">
          {["A. Bello", "C. Duarte", "G. Haruna"].map((n, i) => (
            <div
              key={n}
              className={cn(
                "rounded-lg px-2.5 py-2 text-xs",
                i === 0 ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {n}
              <span className="mt-0.5 block truncate text-[10px] font-normal opacity-70">
                Re: Your order is on…
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
            Your order is on its way — track it here.
            <span className="mt-1 block text-[10px] opacity-70">You · sent Tuesday</span>
          </div>
          <div
            className={cn(
              "relative max-w-[85%] rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2.5 text-sm",
              active && "animate-pulse-ring",
            )}
          >
            <CornerUpLeft
              className="absolute -left-2 -top-2 size-4 rounded-full bg-emerald-500 p-0.5 text-white"
              aria-hidden="true"
            />
            Can I change the delivery address?
            <span className="mt-1 block text-[10px] text-muted-foreground">A. Bello · just now</span>
          </div>
          <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn("size-1.5 rounded-full bg-muted-foreground/60", active && "animate-throb")}
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </span>
            Your teammate is replying
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Replies come back to a shared inbox instead of a no-reply void — and an automated welcome
        series stops the moment someone writes back.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 5 — Assistant
// ---------------------------------------------------------------------------
function AssistantScene({ active }: { active: boolean }) {
  return (
    <Screen path="app.rootmail.io/assistant">
      <div className="space-y-3">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-3.5 py-2.5 text-sm">
          Set up a 3-email welcome series for new subscribers.
        </div>
        <div className="relative max-w-[92%] rounded-2xl rounded-bl-sm border bg-background px-3.5 py-3 text-sm">
          <Sweep active={active} />
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> Assistant
          </p>
          <p className="text-muted-foreground">Done — here&apos;s what I built:</p>
          <ul className="mt-2 space-y-1.5">
            {[
              "Welcome — the moment they subscribe",
              "What you can do with it — 2 days later",
              "A question for you — 5 days later",
            ].map((s) => (
              <li key={s} className="flex items-center gap-2 text-xs">
                <Check className="size-3.5 shrink-0 text-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground">
            It&apos;s paused — say the word and I&apos;ll turn it on.
            {active ? (
              <span className="ml-0.5 inline-block h-3.5 w-px animate-blink bg-foreground align-middle" />
            ) : null}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Ask in plain English and it builds the thing — or diagnoses it. &ldquo;Why did this
        bounce?&rdquo; gets a real answer, not a support ticket.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

const slides: Slide[] = [
  { id: "design", label: "Design", content: (a) => <StudioScene active={a} /> },
  { id: "audience", label: "Audience", content: (a) => <AudienceScene active={a} /> },
  { id: "delivery", label: "Delivery", content: (a) => <DeliveryScene active={a} /> },
  { id: "replies", label: "Replies", content: (a) => <RepliesScene active={a} /> },
  { id: "assistant", label: "Assistant", content: (a) => <AssistantScene active={a} /> },
];

export function ProductShow() {
  return (
    <section id="tour" className="border-t border-border/60 bg-secondary/20 py-20 md:py-28">
      <div className="container">
        <Reveal inView className="mx-auto mb-10 max-w-2xl text-center">
          <Badge className="mb-4">
            <Send className="size-3" /> A look inside
          </Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            This is what a Tuesday looks like
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Design an email, pick who gets it, watch it land, answer what comes back. Five screens,
            one product — it plays on its own, or click through at your pace.
          </p>
        </Reveal>

        <div className="mx-auto max-w-4xl">
          <Carousel slides={slides} label="A tour of rootmail" interval={7000} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Users className="mr-1 inline size-3" />
          Illustrative sample data — no real contacts here.
        </p>
      </div>
    </section>
  );
}
