"use client";

import { useMemo, useState } from "react";
import { Code2, FilePlus2, Sparkles } from "lucide-react";
import { BASIC_LAYOUTS, STARTERS, startersForWing, type BasicLayout, type Starter, type StarterWing } from "./starters";
import { docToHtml } from "@/lib/email-doc";
import { cn } from "@/lib/utils";

const WINGS: { id: StarterWing; label: string; hint: string }[] = [
  { id: "transactional", label: "Transactional", hint: "Product email — receipts, resets, alerts." },
  { id: "marketing", label: "Marketing", hint: "Audience email — newsletters, promos, news." },
];

/** A true-to-output thumbnail: the design rendered as real email HTML, scaled down. */
function Thumb({ html, tall }: { html: string; tall?: boolean }) {
  return (
    <div className={cn("flex justify-center overflow-hidden border-b bg-[#f4f4f7]", tall ? "h-44" : "h-32")}>
      <div style={{ width: 600, flex: "0 0 auto", transform: `scale(${tall ? 0.5 : 0.42})`, transformOrigin: "top center" }}>
        {/* sandbox="" strips scripts; the preview is inert (pointer-events none). */}
        <iframe title="" aria-hidden tabIndex={-1} sandbox="" srcDoc={html} scrolling="no"
          style={{ width: 600, height: 700, border: 0, background: "#fff", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

export function StarterGallery({
  defaultWing,
  onPick,
  onBlank,
  onBasic,
  onHtml,
}: {
  defaultWing: StarterWing;
  onPick: (s: Starter) => void;
  onBlank: (wing: StarterWing) => void;
  onBasic: (layout: BasicLayout, wing: StarterWing) => void;
  onHtml: (wing: StarterWing) => void;
}) {
  const [wing, setWing] = useState<StarterWing>(defaultWing);

  // Pre-render every design once so switching wings is instant.
  const starterHtml = useMemo(() => Object.fromEntries(STARTERS.map((s) => [s.id, docToHtml(s.doc)])), []);
  const basicHtml = useMemo(() => Object.fromEntries(BASIC_LAYOUTS.map((b) => [b.id, docToHtml(b.doc)])), []);

  const starters = startersForWing(wing);
  const active = WINGS.find((w) => w.id === wing);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">How do you want to start?</h2>
          <p className="text-sm text-muted-foreground">{active?.hint} You can change anything in the studio.</p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          {WINGS.map((w) => (
            <button key={w.id} type="button" onClick={() => setWing(w.id)}
              className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", wing === w.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Start fresh: blank canvas or raw HTML */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => onBlank(wing)}
          className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FilePlus2 className="size-5" /></span>
          <span>
            <span className="block font-medium group-hover:text-primary">Start from scratch</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">A blank canvas. Add blocks and design it your way — no code.</span>
          </span>
        </button>
        <button type="button" onClick={() => onHtml(wing)}
          className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:text-foreground"><Code2 className="size-5" /></span>
          <span>
            <span className="block font-medium group-hover:text-primary">Paste your own HTML</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Already have a design? Drop in raw HTML — sent exactly as written.</span>
          </span>
        </button>
      </div>

      {/* Basic layouts — structural skeletons */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Basic layouts</h3>
          <p className="text-xs text-muted-foreground">Simple scaffolds to fill in — pick the bones, add the words.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {BASIC_LAYOUTS.map((b) => (
            <button key={b.id} type="button" onClick={() => onBasic(b, wing)}
              className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:ring-1 hover:ring-primary/20">
              <Thumb html={basicHtml[b.id]} />
              <div className="p-3">
                <p className="text-sm font-medium group-hover:text-primary">{b.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{b.blurb}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Designed templates — finished, on-message */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Designed templates</h3>
          <p className="text-xs text-muted-foreground">Ready-made {active?.label.toLowerCase()} emails. Pick one, then make it yours.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {starters.map((s) => (
            <button key={s.id} type="button" onClick={() => onPick(s)}
              className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:ring-1 hover:ring-primary/20">
              <Thumb html={starterHtml[s.id]} tall />
              <div className="p-4">
                <p className="font-medium group-hover:text-primary">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" /> Prefer to describe it? Start blank, then use <span className="font-medium text-foreground">Ask AI</span> in the studio to draft the whole email.
      </p>
    </div>
  );
}
