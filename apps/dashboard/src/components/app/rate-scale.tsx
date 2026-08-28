"use client";

import { useState } from "react";
import { Scrub, type ScrubRule } from "@rootmail/design";
import {
  REPUTATION_THRESHOLDS,
  REPUTATION_THROTTLE_PER_HOUR,
  REPUTATION_WINDOW_DAYS,
} from "@/lib/reputation";

/**
 * A rate drawn against the rules that act on it.
 *
 * The deliverability page used to render a bounce rate as a coloured number
 * and a complaint rate as a coloured number, with the threshold in six-point
 * grey underneath. That tells an operator whether we currently disapprove; it
 * does not tell them how much room they have, which is the only question they
 * actually have. `docs/design/00-PHILOSOPHY.md` §5.2 names this exact surface:
 * "the score with the published thresholds as rules across it — you do not read
 * a grade, you see how close the line is to a rule."
 *
 * So: the same drawing as the marketing site's scale, fed by the numbers the
 * worker really enforces on (`REPUTATION_THRESHOLDS`, imported, never copied).
 * The handle starts at the operator's own rate. Dragging it is exploration —
 * "what happens if this doubles" — so the real value stays printed beside the
 * scale and one control puts the handle back on it. A scale you can only look
 * at teaches the rules; a scale you can move teaches the distance.
 *
 * NOTE ON WINDOWS. The rate above is measured over the page's window; the sweep
 * judges a rolling `REPUTATION_WINDOW_DAYS`. Those are different numbers and the
 * caption says so rather than quietly implying the handle is what the sweep sees.
 */

type Kind = "bounce" | "complaint";

const pct = (n: number) => n * 100;

const CONFIG: Record<
  Kind,
  { max: number; step: number; bigStep: number; noun: string; denominator: string }
> = {
  bounce: { max: 12, step: 0.1, bigStep: 1, noun: "bounce rate", denominator: "of sent" },
  complaint: { max: 0.7, step: 0.01, bigStep: 0.05, noun: "complaint rate", denominator: "of delivered" },
};

/** The provider's own ceiling, which is not ours and is drawn as not ours. */
const PROVIDER_SUSPENDS: Record<Kind, number> = { bounce: 10, complaint: 0.5 };

function rulesFor(kind: Kind): ScrubRule[] {
  const t = REPUTATION_THRESHOLDS;
  const warn = pct(t.warn[kind]);
  const throttle = pct(t.throttle[kind]);
  const pause = pct(t.pause[kind]);
  const fmt = (v: number) => (kind === "bounce" ? `${v}%` : `${v.toFixed(2)}%`);
  return [
    { at: warn, value: fmt(warn), label: "we tell you", tone: "acted" },
    {
      at: throttle,
      value: fmt(throttle),
      label: `throttled to ${REPUTATION_THROTTLE_PER_HOUR}/hr`,
      tone: "acted",
    },
    { at: pause, value: fmt(pause), label: "we pause sending", tone: "stopped", zone: true },
    {
      at: PROVIDER_SUSPENDS[kind],
      labelAt: CONFIG[kind].max,
      value: fmt(PROVIDER_SUSPENDS[kind]),
      label: "your provider can suspend the whole account",
      tone: "stopped",
      row: 1,
      align: "right",
    },
  ];
}

/** What happens at a given value, as a sentence naming the actor. */
function consequence(kind: Kind, v: number): string {
  const t = REPUTATION_THRESHOLDS;
  const noun = CONFIG[kind].noun;
  if (v >= pct(t.pause[kind]))
    return `At this ${noun} rootmail pauses your sending and tells you the number that stopped it. Your provider can suspend the whole account near here too, which stops every other sender on it.`;
  if (v >= pct(t.throttle[kind]))
    return `At this ${noun} rootmail throttles you to ${REPUTATION_THROTTLE_PER_HOUR} messages an hour. Nothing is dropped — it is metered until the rate comes back down.`;
  if (v >= pct(t.warn[kind]))
    return `At this ${noun} rootmail tells you and does nothing else. This is the cheap moment to fix it.`;
  return `At this ${noun} nothing is restricted. The first thing that changes is a message from us at ${kind === "bounce" ? `${pct(t.warn.bounce)}%` : `${pct(t.warn.complaint).toFixed(2)}%`}.`;
}

export function RateScale({
  kind,
  actual,
  windowDays,
}: {
  kind: Kind;
  /** The operator's real rate, already in percent. */
  actual: number;
  /** The window the real rate was measured over. */
  windowDays: number;
}) {
  const cfg = CONFIG[kind];
  const start = Math.min(cfg.max, Math.max(0, actual));
  const [v, setV] = useState(start);
  const moved = Math.abs(v - start) > cfg.step / 2;
  const fmt = (x: number) => (kind === "bounce" ? `${x.toFixed(1)}%` : `${x.toFixed(2)}%`);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium capitalize">{cfg.noun}</h3>
        <p className="font-mono text-[11px] text-muted-foreground" data-fact>
          yours: {fmt(start)} · {windowDays}d · {cfg.denominator} · provider feedback
        </p>
      </div>

      <Scrub
        className="mt-4"
        min={0}
        max={cfg.max}
        step={cfg.step}
        bigStep={cfg.bigStep}
        value={v}
        onChange={setV}
        rules={rulesFor(kind)}
        label={`${cfg.noun} — drag to see what happens at a given rate`}
        valueText={`${fmt(v)}. ${consequence(kind, v)}`}
        format={fmt}
      />

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{consequence(kind, v)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your {fmt(start)} covers the last {windowDays} days. The sweep that acts on it judges a
        rolling {REPUTATION_WINDOW_DAYS} days, so the two can disagree for a while after a bad
        batch.
        {moved ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => setV(start)}
              className="font-medium text-foreground underline underline-offset-2"
            >
              Put the handle back on {fmt(start)}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
