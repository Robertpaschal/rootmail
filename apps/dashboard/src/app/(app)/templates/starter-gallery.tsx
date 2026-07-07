"use client";

import { useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { STARTERS, startersForWing, type Starter, type StarterWing } from "./starters";
import { docToHtml } from "@/lib/email-doc";
import { cn } from "@/lib/utils";

const WINGS: { id: StarterWing; label: string; hint: string }[] = [
  { id: "transactional", label: "Transactional", hint: "Product email — receipts, resets, alerts." },
  { id: "marketing", label: "Marketing", hint: "Audience email — newsletters, promos, news." },
];

/** A true-to-output thumbnail: the starter rendered as email HTML, scaled down. */
function Thumb({ html }: { html: string }) {
  return (
    <div className="flex h-44 justify-center overflow-hidden border-b bg-[#f4f4f7]">
      <div style={{ width: 600, flex: "0 0 auto", transform: "scale(0.5)", transformOrigin: "top center" }}>
        {/* sandbox="" strips scripts; the preview is inert (pointer-events none). */}
        <iframe
          title=""
          aria-hidden
          tabIndex={-1}
          sandbox=""
          srcDoc={html}
          scrolling="no"
          style={{ width: 600, height: 700, border: 0, background: "#fff", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

export function StarterGallery({
  defaultWing,
  onPick,
  onBlank,
}: {
  defaultWing: StarterWing;
  onPick: (s: Starter) => void;
  onBlank: (wing: StarterWing) => void;
}) {
  const [wing, setWing] = useState<StarterWing>(defaultWing);

  // Pre-render every starter once so switching wings is instant.
  const htmlById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of STARTERS) m[s.id] = docToHtml(s.doc);
    return m;
  }, []);

  const starters = startersForWing(wing);
  const active = WINGS.find((w) => w.id === wing);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Start from a design</h2>
          <p className="text-sm text-muted-foreground">{active?.hint} Pick one, then make it yours.</p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          {WINGS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWing(w.id)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                wing === w.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {starters.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:ring-1 hover:ring-primary/20"
          >
            <Thumb html={htmlById[s.id]} />
            <div className="p-4">
              <p className="font-medium group-hover:text-primary">{s.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
            </div>
          </button>
        ))}

        {/* Blank canvas — always available on either wing. */}
        <button
          type="button"
          onClick={() => onBlank(wing)}
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-6 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <FilePlus2 className="size-6" />
          <span className="text-sm font-medium">Start from scratch</span>
          <span className="text-xs">A blank {active?.label.toLowerCase()} template.</span>
        </button>
      </div>
    </div>
  );
}
