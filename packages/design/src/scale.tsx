"use client";

import { useCallback, useRef } from "react";
import { cx } from "./cx";

/**
 * A LABELLED SCALE WITH FIXED RULES AND A DRAGGABLE HANDLE.
 *
 * `docs/design/04-EXPERIENCE.md` §5.2 and the deliverability page in the
 * dashboard are the same drawing: a number moving along an axis that has
 * published thresholds on it. You do not read a grade; you see how close the
 * line is to a rule.
 *
 * WHAT THIS COMPONENT REFUSES TO DO
 * - It never animates. A scrubber responds; it does not play. There is no
 *   transition on the handle, because a handle that eases into position is a
 *   handle that is behind the finger dragging it.
 * - It never hides a rule. Every threshold is drawn and labelled with its
 *   number at every value, so the resting state carries all the facts and the
 *   handle only says where YOU are among them.
 * - `aria-valuetext` is a SENTENCE, not a number. A screen reader arriving at
 *   "0.31" learns nothing; arriving at "0.31% — rootmail throttles this client
 *   to 60 sends an hour" learns the whole section.
 */

export type ScrubRule = {
  /** Where on the scale, in the same units as min/max. */
  at: number;
  /** The number, preformatted — this is what the reader checks us against. */
  value: string;
  /** What happens at this number. Kept to a few words. */
  label: string;
  tone: "witnessed" | "acted" | "stopped";
  /** Drawn as a zone running to the end of the scale rather than a hairline. */
  zone?: boolean;
  /**
   * Which caption row this rule's words sit on. Rules on row 1 also give up
   * their slot in the number strip above the scale.
   *
   * This exists because two rules can share a number. On the complaint scale
   * ours pauses one client at 0.50% and the provider suspends the whole
   * account near the same figure — two different consequences at one position,
   * which is the section's sharpest fact and cannot be drawn as one tick with
   * one caption. Row 1 is where a rule that is not ours goes.
   */
  row?: 0 | 1;
  /**
   * How the caption sits against its position. A zone's caption belongs at the
   * end of the band it covers, not centred on the band's first pixel.
   */
  align?: "center" | "right";
  /** Where the caption sits, when that is not where the rule is drawn. */
  labelAt?: number;
};

const TONE = {
  witnessed: "bg-witnessed",
  acted: "bg-acted",
  stopped: "bg-stopped",
} as const;

const TEXT = {
  witnessed: "text-witnessed",
  acted: "text-acted",
  stopped: "text-stopped",
} as const;

export function Scrub({
  min,
  max,
  step = 0.01,
  bigStep = 0.05,
  value,
  onChange,
  rules,
  label,
  valueText,
  format,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  bigStep?: number;
  value: number;
  onChange: (v: number) => void;
  rules: ScrubRule[];
  /** Accessible name of the control. */
  label: string;
  /** The full sentence a screen reader hears at this value. */
  valueText: string;
  /** The handle's own printed value. */
  format: (v: number) => string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const clamp = useCallback(
    (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step)),
    [max, min, step],
  );

  const fromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return; // a collapsed pane reports 0; ignore it
      onChange(clamp(min + ((clientX - r.left) / r.width) * (max - min)));
    },
    [clamp, max, min, onChange],
  );

  return (
    <div className={cx("select-none", className)}>
      {/* The numbers, above the scale, always all of them. */}
      <div className="relative hidden h-9 text-[11px] sm:block">
        {rules
          .filter((r) => r.row !== 1)
          .map((r) => (
            <span
              key={r.value}
              className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-center font-mono"
              style={{ left: `${pct(r.at)}%` }}
              data-fact
            >
              <span className={TEXT[r.tone]}>{r.value}</span>
            </span>
          ))}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) fromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          const d = e.shiftKey ? bigStep : step;
          const next: Record<string, number> = {
            ArrowRight: value + d,
            ArrowUp: value + d,
            ArrowLeft: value - d,
            ArrowDown: value - d,
            Home: min,
            End: max,
          };
          if (next[e.key] === undefined) return;
          e.preventDefault();
          onChange(clamp(next[e.key]));
        }}
        className="relative h-10 cursor-ew-resize touch-none rounded outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* The scale itself: one hairline the whole width. */}
        <span className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-rule" />

        {rules.map((r) =>
          r.zone ? (
            <span
              key={`z-${r.value}`}
              aria-hidden="true"
              className={cx("absolute top-1/2 h-[2px] -translate-y-1/2 opacity-70", TONE[r.tone])}
              style={{ left: `${pct(r.at)}%`, right: 0 }}
            />
          ) : null,
        )}

        {rules.map((r) => (
          <span
            key={`r-${r.value}`}
            aria-hidden="true"
            className={cx("absolute top-1/2 h-5 w-[2px] -translate-y-1/2", TONE[r.tone])}
            style={{ left: `${pct(r.at)}%` }}
          />
        ))}

        {/* The handle. A node, because nodes are the only circles here. */}
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-background shadow-knockout"
          style={{ left: `${pct(value)}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-medium"
          style={{ left: `${pct(value)}%` }}
          data-fact
        >
          {format(value)}
        </span>
      </div>

      {/* What each rule means, in words, under the number it belongs to.
          Positioned captions need room to sit beside each other, so below `sm`
          they are replaced by the ruled list further down — the same rules, the
          same numbers, stacked. Neither version is conditional on script. */}
      <div className="relative mt-5 hidden h-8 text-[11px] leading-tight sm:block">
        {rules
          .filter((r) => r.row !== 1)
          .map((r) => (
            <span
              key={`l-${r.value}`}
              className={cx("absolute top-0 w-24 -translate-x-1/2 text-center", TEXT[r.tone])}
              style={{ left: `${pct(r.at)}%` }}
            >
              {r.label}
            </span>
          ))}
      </div>

      {rules.some((r) => r.row === 1) ? (
        <div className="relative hidden h-8 text-[11px] leading-tight sm:block">
          {rules
            .filter((r) => r.row === 1)
            .map((r) => (
              <span
                key={`l1-${r.value}`}
                className={cx(
                  "absolute top-0 w-40",
                  r.align === "right" ? "-translate-x-full text-right" : "-translate-x-1/2 text-center",
                  TEXT[r.tone],
                )}
                style={{ left: `${pct(r.labelAt ?? r.at)}%` }}
              >
                <span className="font-mono" data-fact>
                  {r.value}
                </span>{" "}
                {r.label}
              </span>
            ))}
        </div>
      ) : null}

      {/* The narrow-screen route to the same four facts. */}
      <ul className="mt-4 divide-y divide-rule border-t border-rule text-[11px] sm:hidden">
        {rules.map((r) => (
          <li key={`m-${r.value}`} className="flex items-baseline gap-3 py-2">
            <span className={cx("w-16 shrink-0 font-mono", TEXT[r.tone])} data-fact>
              {r.value}
            </span>
            <span className={TEXT[r.tone]}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
