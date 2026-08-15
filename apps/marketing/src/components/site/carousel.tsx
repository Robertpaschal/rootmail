"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface Slide {
  id: string;
  /** Shown on the tab/dot control and announced to screen readers. */
  label: string;
  content: (active: boolean) => ReactNode;
}

/**
 * An auto-advancing carousel.
 *
 * Three deliberate mechanics:
 *
 * 1. **The track is moved by a CSS transition on `transform`, not by a JS
 *    animation loop.** framer-motion computes each frame in `requestAnimationFrame`,
 *    which does not tick in a hidden/background tab — the slide would freeze
 *    part-way and the visitor would see half of two slides. A CSS transition
 *    still ARRIVES at its end state when it can't be animated, so the right
 *    slide is on screen either way.
 *
 * 2. **Autoplay is a `setInterval`, not a rAF timer**, for the same reason:
 *    timers keep firing when frames don't.
 *
 * 3. **It stops when a person is engaging with it** — hover, keyboard focus,
 *    or a touch — and never starts at all under `prefers-reduced-motion`.
 *    A carousel that moves out from under someone mid-sentence is the reason
 *    carousels have the reputation they do.
 */
export function Carousel({
  slides,
  interval = 7000,
  className,
  label,
}: {
  slides: Slide[];
  /** ms per slide. */
  interval?: number;
  className?: string;
  /** Accessible name for the whole carousel. */
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  const playing = !paused && !reduce && slides.length > 1;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), interval);
    return () => clearInterval(t);
  }, [playing, interval, slides.length]);

  return (
    <div
      className={cn("group/carousel relative", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(index + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(index - 1);
        }
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start != null && end != null && Math.abs(end - start) > 45) {
          go(index + (end < start ? 1 : -1));
        }
        touchX.current = null;
        setPaused(false);
      }}
    >
      {/* Named tabs, not anonymous dots. A dot gives you no reason to click it;
          "Replies" does — and it doubles as the section's table of contents. */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-1.5" role="tablist" aria-label={label}>
        {slides.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={i === index}
            aria-controls={`slide-${s.id}`}
            onClick={() => go(i)}
            className={cn(
              "relative overflow-hidden rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              i === index
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {s.label}
            {/* Time-to-next, drawn on the active tab. Decorative: it says how
                long you have, and its absence costs nothing. */}
            {i === index && playing ? (
              <span
                key={index}
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-timer bg-primary-foreground/60"
                style={{ animationDuration: `${interval}ms` }}
                aria-hidden="true"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.21,0.65,0.36,1)]"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((s, i) => (
            <div
              key={s.id}
              id={`slide-${s.id}`}
              role="tabpanel"
              aria-label={s.label}
              aria-hidden={i !== index}
              // Inactive slides are still in the DOM (the track is one row) but
              // must not be reachable by tab — focus would scroll the track and
              // tear the layout.
              inert={i !== index ? true : undefined}
              className="w-full shrink-0 px-0.5"
            >
              {s.content(i === index)}
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-3">
          <CarouselArrow dir="prev" onClick={() => go(index - 1)} />
          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {index + 1} / {slides.length}
          </span>
          <CarouselArrow dir="next" onClick={() => go(index + 1)} />
        </div>
      ) : null}
    </div>
  );
}

function CarouselArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "prev" ? "Previous" : "Next"}
      className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}
