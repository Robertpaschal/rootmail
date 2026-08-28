"use client";

import { useState } from "react";
import { Scrub, type ScrubRule } from "@rootmail/design";

/**
 * "Why does this exist?" — the section that names the enemy, as a scrubber.
 *
 * `docs/design/04-EXPERIENCE.md` §5.2. What was here was two paragraphs and a
 * four-row `<dl>` describing, in prose, a set of numbers and what crossing them
 * costs. The visitor's own hand does that now: drag the complaint rate across
 * the scale and watch one client's branch go from solid, to acted-on, to
 * literally thinner, to severed — and watch the second readout say the same
 * nothing at every position until the account is gone.
 *
 * THE NUMBERS ARE REAL AND THEY ARE NOT DUPLICATED CAREFULLY — they are
 * duplicated ON PURPOSE. `apps/marketing` ships with no backend dependency
 * (CLAUDE.md, "keeps the modular boundary clean"), so it cannot import
 * `REPUTATION_THRESHOLDS`. Every figure below is copied from
 * `packages/core/src/reputation.ts` and named here so a future edit knows where
 * its source is:
 *
 *   REPUTATION_THRESHOLDS.warn.complaint      0.001  → 0.10%
 *   REPUTATION_THRESHOLDS.throttle.complaint  0.003  → 0.30%
 *   REPUTATION_THRESHOLDS.pause.complaint     0.005  → 0.50%
 *   REPUTATION_THROTTLE_PER_HOUR              60
 *   REPUTATION_WINDOW_DAYS                    7
 *   REPUTATION_MIN_VERDICTS                   20
 *
 * The provider's figure is SES's published account-level complaint threshold,
 * which is why it is drawn as a band running off the end of the scale rather
 * than as a fourth tick of ours: at 0.50% we stop one client and they stop the
 * whole account, and those are two different events at one number. Drawing them
 * as one rule would be the flattering version.
 *
 * THE THREE LAWS
 * 1. Nothing here animates, at any setting. The scrubber responds; it does not
 *    play. The resting state is server-rendered at 0.31% — inside the throttle
 *    band — with all four rules labelled with their numbers and both readouts
 *    populated, so a visitor who never touches it, and a visitor with no
 *    script at all, has read the whole section.
 * 2. `prefers-reduced-motion` needs no branch: there is no transition to skip.
 * 3. The rendering law holds in the drawing. A throttled branch is 1px because
 *    it is metered, not because 1px looks urgent; a paused branch ends in a bar
 *    and nothing is drawn past it.
 */

/** Percent, on the same axis the enforcement loop judges. */
const WARN = 0.1;
const THROTTLE = 0.3;
const PAUSE = 0.5;
const MAX = 0.6;

const rules: ScrubRule[] = [
  { at: WARN, value: "0.10%", label: "rootmail warns you", tone: "acted" },
  { at: THROTTLE, value: "0.30%", label: "throttled to 60/hour", tone: "acted" },
  { at: PAUSE, value: "0.50%", label: "rootmail pauses this client", tone: "stopped" },
  {
    at: PAUSE,
    labelAt: MAX,
    row: 1,
    align: "right",
    zone: true,
    value: "~0.50%",
    label: "the provider suspends the whole account",
    tone: "stopped",
  },
];

type Band = "clear" | "warned" | "throttled" | "paused";

function bandOf(v: number): Band {
  if (v >= PAUSE) return "paused";
  if (v >= THROTTLE) return "throttled";
  if (v >= WARN) return "warned";
  return "clear";
}

/** What rootmail did, with the actor named and a timestamp. */
const ACTED: Record<Band, string> = {
  clear: "rootmail: sending · nothing to act on",
  warned: "rootmail warned you about harbourclinic.com · 03:58",
  throttled: "rootmail throttled harbourclinic.com to 60/hour · 04:12",
  paused: "rootmail paused harbourclinic.com · 04:19",
};

/**
 * The second readout. It names nobody and it is a structural claim, not a
 * competitor claim: it is what a system that does not score each sender
 * separately is able to say, which is nothing, right up until the account goes.
 */
const DEFAULTED: Record<Band, string> = {
  clear: "nothing. The open rate keeps going up.",
  warned: "nothing. The open rate keeps going up.",
  throttled: "nothing. The open rate keeps going up.",
  paused: "account suspended. You find out from your customer.",
};

/** The branch: 2px, then 2px acted, then 1px acted, then severed. */
function Branch({ band }: { band: Band }) {
  const tone =
    band === "clear" ? "bg-witnessed" : band === "paused" ? "bg-stopped" : "bg-acted";
  const thin = band === "throttled";
  return (
    <span aria-hidden="true" className="relative inline-flex h-4 w-28 shrink-0 items-center">
      <span
        className={`${tone} ${thin ? "h-px" : "h-[2px]"} ${band === "paused" ? "w-[calc(100%-3px)]" : "w-full"}`}
      />
      {band === "paused" ? (
        <span className="absolute right-0 h-4 w-[3px] rounded-sm bg-stopped" />
      ) : (
        <span
          className={`absolute right-0 size-2 rounded-full ${tone}`}
          style={{ transform: "translateX(50%)" }}
        />
      )}
    </span>
  );
}

export function ThresholdScrub() {
  const [v, setV] = useState(0.31);
  const band = bandOf(v);
  const pctText = `${v.toFixed(2)}%`;

  return (
    <div className="mt-12">
      <p className="font-mono text-[11px] text-ink-muted" data-fact>
        complaint rate · harbourclinic.com · 7d
      </p>

      <div className="mt-4 sm:px-14">
        <Scrub
          min={0}
          max={MAX}
          step={0.01}
          bigStep={0.05}
          value={v}
          onChange={setV}
          rules={rules}
          label="Complaint rate for one client"
          valueText={`${pctText} — ${ACTED[band]}`}
          format={(n) => `${n.toFixed(2)}%`}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-6">
        <Branch band={band} />
        <span
          className={`font-mono text-[11px] ${band === "paused" ? "text-stopped" : band === "clear" ? "text-witnessed" : "text-acted"}`}
          aria-live="polite"
          data-fact
        >
          {ACTED[band]}
        </span>
      </div>

      <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
        the common default:{" "}
        <span className={band === "paused" ? "text-stopped" : undefined}>{DEFAULTED[band]}</span>
      </p>

      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-muted">
        7-day trailing window, never on fewer than 20 sends the provider ruled on.
      </p>
    </div>
  );
}

export function TheBreak() {
  return (
    <section className="slab settle slab-ink lit-edge">
      <div className="container py-16 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 className="display-l text-balance">
              Email fails quietly. The number on the screen keeps going up.
            </h2>
            <p className="lead mt-6 max-w-md text-ink-muted">
              The fix is not a better chart. It is an account of what happened to every message and
              every sender, and acting on it before a person has to.
            </p>
          </div>

          <ThresholdScrub />
        </div>
      </div>
    </section>
  );
}
