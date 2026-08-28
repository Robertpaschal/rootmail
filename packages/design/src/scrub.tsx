"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Line, type Station } from "./line";
import { cx } from "./cx";

/**
 * PULL THE THREAD — `docs/design/00-PHILOSOPHY.md` §5.4.
 *
 * The line is not a picture of the audit trail; it IS the audit trail, and
 * reading it is dragging along it. Hover or arrow-key from station to station
 * and a mono readout names the event and its exact timestamp, with everything
 * past the cursor drawn at reduced weight.
 *
 * THE CONSTRAINTS THAT SHAPE THIS COMPONENT — all four are non-negotiable:
 *
 * 1. **Nothing is revealed by motion, and nothing waits on an animation.** The
 *    full event list renders underneath as plain rows at ALL times, and the
 *    readout starts populated at the furthest station that actually happened.
 *    With `requestAnimationFrame` frozen — the browser preview pane, a hidden
 *    tab, a throttled device — every fact on screen is still readable. Scrubbing
 *    is enhancement over content that is already there.
 * 2. **Keyboard reaches every station.** The line is a real focusable control
 *    with `role="slider"`, arrow/Home/End keys, and live-announced values. A
 *    mouse-only audit trail is not an audit trail.
 * 3. **`prefers-reduced-motion` turns the follow into an instant jump** — the
 *    readout does not slide, it appears at the station. Handled in CSS via
 *    `motion-reduce:transition-none` rather than a JS media query, so it also
 *    holds when JS is still booting.
 * 4. **The cursor never changes a station's state.** Position is presentation;
 *    state is a claim about what happened. `activeIndex` dims what is ahead and
 *    nothing more — an `opened` station stays hollow at every cursor position.
 */

export type ScrubEvent = {
  /** Must line up 1:1 with the station of the same index. */
  at?: string;
  /** Where the fact came from: "provider feedback", "tracking pixel", "api". */
  method?: string;
  /** Anything further worth printing — a bounce code, a threshold. */
  detail?: string;
};

/** The furthest station that actually happened — where the cursor starts. */
function furthestKnown(stations: Station[]): number {
  const stopped = stations.findIndex((s) => s.state === "stopped");
  if (stopped !== -1) return stopped;
  for (let i = stations.length - 1; i >= 0; i--) {
    if (stations[i].state !== "unknown") return i;
  }
  return 0;
}

/**
 * The cursor itself, extracted so every scrubbable surface shares ONE
 * implementation of "where along the line is the pointer, and which station is
 * that?" — `ScrubbableLine` here and `LiveLine` next door both mount it.
 *
 * It deliberately owns only the position. What the position MEANS — a readout,
 * a marked ledger row, a popover — is the caller's, because those differ per
 * surface and the maths does not.
 */
export function useStationCursor(count: number, initial: number) {
  const [active, setActive] = useState(initial);
  const trackRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count],
  );

  /** Pointer x → nearest station. Reads the RENDERED width rather than the
   *  SVG viewBox, so it stays correct however the line is scaled — and bails
   *  at width 0, which is what a collapsed preview pane reports. */
  const indexFrom = useCallback(
    (clientX: number): number | null => {
      const el = trackRef.current;
      if (!el || count < 2) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return clamp(Math.round(((clientX - r.left) / r.width) * (count - 1)));
    },
    [clamp, count],
  );

  const onPointer = useCallback(
    (e: React.PointerEvent) => {
      const i = indexFrom(e.clientX);
      if (i !== null) setActive(i);
    },
    [indexFrom],
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const keys: Record<string, number> = {
        ArrowRight: active + 1,
        ArrowLeft: active - 1,
        ArrowUp: active + 1,
        ArrowDown: active - 1,
        Home: 0,
        End: count - 1,
      };
      const next = keys[e.key];
      if (next === undefined) return;
      e.preventDefault();
      setActive(clamp(next));
    },
    [active, clamp, count],
  );

  return { active, setActive, trackRef, indexFrom, onPointer, onKey };
}

export function ScrubbableLine({
  stations,
  events = [],
  scale = "page",
  className,
  caption,
  children,
}: {
  stations: Station[];
  events?: ScrubEvent[];
  scale?: "page" | "hero";
  className?: string;
  /** One line under the readout — what this line is a record OF. */
  caption?: string;
  /**
   * The authoritative, always-rendered record this line points at.
   *
   * There is no way to turn the record OFF — passing nothing falls back to a
   * generated row per station. That is deliberate: constraint 1 says every fact
   * must be readable with no frames animating, and a boolean like
   * `showList={false}` is exactly how that invariant would get switched off
   * under deadline. A caller with a richer trail (the full audit log carries
   * more entries than there are stations) passes it here instead.
   */
  children?: React.ReactNode;
}) {
  const rest = furthestKnown(stations);
  const { active, setActive, trackRef, onPointer, onKey } = useStationCursor(
    stations.length,
    rest,
  );
  const listId = useId();

  const s = stations[active];
  const ev = events[active] ?? {};

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Message lifecycle — arrow keys move between stations"
        aria-valuemin={0}
        aria-valuemax={stations.length - 1}
        aria-valuenow={active}
        aria-valuetext={`${s.label}${s.state === "inferred" ? ", inferred" : ""}${
          ev.at ? `, ${ev.at}` : ""
        }`}
        aria-describedby={listId}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setActive(rest)}
        onKeyDown={onKey}
        onBlur={() => setActive(rest)}
        className="cursor-ew-resize rounded outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Line stations={stations} scale={scale} activeIndex={active} />
      </div>

      {/* The readout. Fixed height so moving along the line never reflows the
          page under the cursor — a readout that shifts what it is describing is
          worse than no readout. */}
      <div className="min-h-[3.25rem] border-l-2 border-rule pl-3">
        <p className="text-sm font-medium">
          {s.label}
          {s.state === "inferred" ? (
            <span className="ml-2 font-normal text-ink-muted">inferred</span>
          ) : null}
          {s.state === "unknown" ? (
            <span className="ml-2 font-normal text-ink-muted">hasn&apos;t happened</span>
          ) : null}
        </p>
        <p className="font-mono text-[11px] leading-snug text-muted-foreground" data-fact>
          {[ev.at, ev.method, ev.detail].filter(Boolean).join(" · ") ||
            (s.state === "unknown" ? "no event — we do not know" : "—")}
        </p>
      </div>

      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}

      {/* Constraint 1, made literal: every fact is here whether or not a single
          frame ever animates, and it is what the slider points at. */}
      <div id={listId}>{children ?? (
      <ol className="divide-y divide-rule border-t border-rule text-xs">
        {stations.map((st, i) => {
          const e = events[i] ?? {};
          return (
            <li
              key={st.label + i}
              className={cx(
                "flex flex-wrap items-baseline gap-x-3 py-1.5 transition-colors duration-interaction ease-interaction motion-reduce:transition-none",
                i === active && "bg-secondary/60",
              )}
            >
              <span className="min-w-24 font-medium">{st.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                {[e.at, e.method, e.detail].filter(Boolean).join(" · ") ||
                  (st.state === "unknown" ? "no event" : "—")}
              </span>
            </li>
          );
        })}
      </ol>
      )}</div>
    </div>
  );
}
