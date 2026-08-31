"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Line, type Station } from "./line";
import { useStationCursor } from "./scrub";
import { cx } from "./cx";

/**
 * THE LINE, RUNNING — `docs/design/04-EXPERIENCE.md` §5.1.
 *
 * The line was already the strongest asset either site has, and it was being
 * used as wallpaper: drawn five times on one page, never moving, never
 * responding, never telling anybody anything the paragraph beside it had not
 * already said. This is the same drawing with a clock attached.
 *
 * THE THREE LAWS, and how each one is met here — none of them is negotiable:
 *
 * 1. **Motion never makes content visible.** The resting state is the
 *    TERMINAL state: server-rendered, every station at its final drawing, every
 *    ledger row present and complete. With JavaScript disabled this component
 *    is a static, finished record. The run is a REPLAY of something already on
 *    screen, driven by `setTimeout` — timers keep firing when frames do not,
 *    which is the difference between this and a `requestAnimationFrame` tween
 *    in a preview pane, a hidden tab or a throttled phone.
 * 2. **`prefers-reduced-motion` reaches the same information.** No auto-run;
 *    the button becomes "Step through it" and advances one stage per press,
 *    announced politely. Every intermediate value the animation would have
 *    passed through is a static ledger row either way.
 * 3. **The rendering law holds inside the demo.** Stations ahead of the cursor
 *    dim; they never change STATE. An `opened` station is hollow at every stage
 *    and every cursor position, because hollow is a claim about what we know
 *    and a clock cannot alter that. Stations the replay has not reached yet
 *    render `unknown` — during a replay we genuinely do not know yet, and
 *    drawing it any other way would be the flattering lie this product exists
 *    to refuse.
 */

export type LiveRow = {
  /** Mono timestamp, or an em dash where there is no event to stamp. */
  at: string;
  /** The event, lowercase, matching its station. */
  event: string;
  /** How we know it: the method, the provider's words, or the refusal. */
  note: string;
  /**
   * A disclosure under the row — why this row is drawn the way it is. Rendered
   * as a real `<details>`, so it works with no script and its words are behind
   * a click rather than in the resting-state budget.
   */
  explain?: string;
};

export function LiveLine({
  stations,
  rows,
  timeline,
  scale = "page",
  wideScale,
  className,
  label,
}: {
  /** The TERMINAL stations — what a visitor sees before any script runs. */
  stations: Station[];
  /** One row per station, 1:1, always rendered. */
  rows: LiveRow[];
  /** Milliseconds from the start of a run at which each station arrives. */
  timeline: number[];
  scale?: "page" | "hero";
  /** Optional second scale used from `lg` up — the hero line is 504px wide. */
  wideScale?: "page" | "hero";
  className?: string;
  /** Accessible name for the line itself. */
  label?: string;
}) {
  const last = stations.length - 1;
  const [stage, setStage] = useState(last); // resting = complete
  const [reduced, setReduced] = useState(false);
  const [openExplain, setOpenExplain] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const { active, setActive, trackRef, indexFrom, onPointer, onKey } = useStationCursor(
    stations.length,
    last,
  );

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clear();
    setStage(0);
    setActive(0);
    timeline.slice(1, stations.length).forEach((ms, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStage(i + 1);
          setActive(i + 1);
        }, ms),
      );
    });
  }, [clear, setActive, stations.length, timeline]);

  // Mount: read the motion preference once, and replay unless it says not to.
  // The preference is read here rather than in CSS because what it changes is a
  // STATE MACHINE, not a transition — and the machine's reduced route is a
  // different control, not a faster animation.
  useEffect(() => {
    const rm =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    if (!rm) run();
    return clear;
  }, [run, clear]);

  const step = useCallback(() => {
    setStage((s) => {
      const next = s >= last ? 0 : s + 1;
      setActive(next);
      return next;
    });
  }, [last, setActive]);

  // What is drawn right now. Anything the replay has not reached is `unknown`:
  // dashed, dim, and honest about it.
  const drawn: Station[] = stations.map((s, i) => {
    if (i <= stage) return s;
    return {
      label: s.label,
      state: "unknown",
      at: undefined,
      inFlight: i === stage + 1 && stage < last,
    };
  });

  const line = (sc: "page" | "hero") => (
    <Line
      stations={drawn}
      scale={sc}
      activeIndex={active}
      label={label ?? "Message lifecycle"}
    />
  );

  const cur = rows[active] ?? rows[rows.length - 1];

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${label ?? "Message lifecycle"} — arrow keys move between stations`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active}
        aria-valuetext={`${stations[active].label}${
          stations[active].state === "inferred" ? ", inferred" : ""
        }${cur?.at && cur.at !== "—" ? `, ${cur.at}` : ""}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setActive(stage)}
        onBlur={() => setActive(stage)}
        onKeyDown={onKey}
        onClick={(e) => {
          const i = indexFrom(e.clientX);
          if (i === null || !rows[i]?.explain) return;
          setOpenExplain((o) => (o === i ? null : i));
        }}
        className="cursor-ew-resize overflow-hidden rounded outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        {wideScale ? (
          <>
            <span className="block lg:hidden">{line(scale)}</span>
            <span className="hidden lg:block">{line(wideScale)}</span>
          </>
        ) : (
          line(scale)
        )}
      </div>

      {/* THE LEDGER. Complete at all times, in the DOM at first paint, never
          conditional on a stage — the line replays a record you can already
          read. Marking a row is a 2px rule, which is addition, not reveal. */}
      <ol className="divide-y divide-rule border-t border-rule text-[13px]">
        {rows.map((r, i) => (
          <li
            key={r.event}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(stage)}
            className={cx(
              "border-l-2 py-2 pl-3 transition-colors duration-interaction ease-interaction motion-reduce:transition-none",
              i === active ? "border-l-ink" : "border-l-transparent",
            )}
          >
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span className="w-[4.5rem] shrink-0 font-mono text-[12.5px] text-ink-muted" data-fact>
                {r.at}
              </span>
              <span className="w-20 shrink-0 font-medium">{r.event}</span>
              <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                {r.note}
              </span>
            </span>
            {r.explain ? (
              <details
                className="mt-1"
                open={openExplain === i}
                onToggle={(e) => setOpenExplain(e.currentTarget.open ? i : null)}
              >
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[12.5px] text-ink-muted underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                  why hollow?
                </summary>
                <p className="max-w-md pb-2 text-[13px] leading-relaxed text-ink-muted">
                  {r.explain}
                </p>
              </details>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex items-baseline gap-4">
        <button
          type="button"
          onClick={reduced ? step : run}
          className="inline-flex min-h-11 items-center rounded text-[13px] font-medium underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {reduced ? "Step through it" : "Run it again"}
        </button>
        <span className="font-mono text-[12.5px] text-ink-muted" aria-live="polite" data-fact>
          {stations[stage]?.label.toLowerCase()}
        </span>
      </div>
    </div>
  );
}
