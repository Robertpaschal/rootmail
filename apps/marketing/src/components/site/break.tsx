/**
 * "Why does this exist?" — the section that names the enemy.
 *
 * ── WHAT THIS SECTION IS FOR ────────────────────────────────────────────────
 * There are published numbers. We act at every one of them, and we act on ONE
 * sender. A system that does not score each sender separately can say nothing
 * at any of those numbers — right up to the last one, where the account goes.
 *
 * ── WHY THE SLIDER IS GONE (2026-08-31) ─────────────────────────────────────
 * What was here was a draggable complaint-rate scrubber. The owner: *"you have
 * a slider that you can pull. I don't know what we're trying to achieve with
 * that, because what would the person even understand from doing that? … The
 * number beneath the slider is beneath the slider, so it's even pointless. The
 * font type as well is kind of weird."*
 *
 * All three are correct and two of them are measurable:
 *
 * - The handle's readout was 12.5px JetBrains Mono, sitting 18px under the
 *   track and 16px above a row of four rule captions in **the same face at the
 *   same size**. Nothing separated "where you are" from "what the rules are".
 * - Figures belong in the display face at size — `00-PHILOSOPHY.md` §10.1
 *   withdrew "mono marks every recorded value" precisely because it put the
 *   most important numbers on a page into the least legible face on it. The
 *   thresholds are `.display-num` now.
 * - And the judgement call underneath: **dragging taught nothing.** The four
 *   thresholds were drawn at every position, so the handle only ever said
 *   where the reader had put it. `05-ENGAGEMENT.md` §1.2 measured the same
 *   thing in the wild — the reference's two biggest demonstration sections have
 *   ZERO interactive elements, because a running demonstration demands nothing
 *   of the reader while a control demands a decision. This is a drawing now.
 *
 * ── WHAT REPLACED IT ────────────────────────────────────────────────────────
 * A ladder. One axis of complaint rate, three published rungs, and TWO COLUMNS
 * held side by side so the comparison is the shape of the section rather than
 * something a reader has to operate a widget to discover. The rendering law
 * does the arguing on its own: our column is `acted` at every rung and then
 * `stopped` on one client; theirs is `unknown` — dashed, because nothing is
 * observed and nothing is said — at every rung and then severed entirely.
 *
 * The last rung is the whole point and it is why the two thresholds share one
 * number instead of being drawn as a band: at 0.50% we pause ONE client and
 * everyone else keeps sending, while the provider's published account-level
 * ceiling takes the entire account. Two different events at one figure.
 *
 * ── THE NUMBERS ARE REAL, AND DUPLICATED ON PURPOSE ─────────────────────────
 * `apps/marketing` ships with no backend dependency (CLAUDE.md, "keeps the
 * modular boundary clean"), so it cannot import `REPUTATION_THRESHOLDS`. Every
 * figure below is copied from `packages/core/src/reputation.ts`:
 *
 *   REPUTATION_THRESHOLDS.warn.complaint      0.001  → 0.10%
 *   REPUTATION_THRESHOLDS.throttle.complaint  0.003  → 0.30%
 *   REPUTATION_THRESHOLDS.pause.complaint     0.005  → 0.50%
 *   REPUTATION_THROTTLE_PER_HOUR              60
 *   REPUTATION_WINDOW_DAYS                    7
 *   REPUTATION_MIN_VERDICTS                   20
 *
 * ── THE LAWS THAT STILL BIND ────────────────────────────────────────────────
 * 1. Nothing here needs a frame, a timer or a script. It is server-rendered
 *    and complete; the only motion is `.rise`, which is scroll-driven,
 *    transform-only and behind `@supports`, and whose failure mode is a row
 *    fourteen pixels low.
 * 2. `prefers-reduced-motion` reaches the identical information.
 * 3. `the common default` names nobody. It is a structural claim about what a
 *    system without per-sender scoring is ABLE to say, which is the only form
 *    of comparison that ships here.
 */

/** The tone of a branch, in the rendering law's own vocabulary. */
type Tone = "witnessed" | "acted" | "stopped" | "unknown";

const STROKE: Record<Exclude<Tone, "unknown">, string> = {
  witnessed: "bg-witnessed",
  acted: "bg-acted",
  stopped: "bg-stopped",
};

const RAIL: Record<Tone, string> = {
  witnessed: "border-witnessed",
  acted: "border-acted",
  stopped: "border-stopped",
  unknown: "border-rule",
};

const INK: Record<Tone, string> = {
  witnessed: "text-witnessed",
  acted: "text-acted",
  stopped: "text-stopped",
  unknown: "text-ink-muted",
};

type BranchSpec = {
  tone: Tone;
  /** A metered branch is drawn 1px because it IS metered — not for urgency. */
  metered?: boolean;
  /** `bar` = it ended here. `open` = it is still running past the edge. */
  end: "node" | "bar" | "open";
  /** Only where two branches sit in one cell and have to be told apart. */
  label?: string;
};

/**
 * One branch of sending. The drawing rules are the same four the line uses:
 * a `stopped` branch ends in a bar and nothing is drawn past it, an `unknown`
 * branch is dashed and dim, and a throttled branch is a hairline because it is
 * metered.
 */
function Branch({ spec }: { spec: BranchSpec }) {
  const { tone, metered, end, label } = spec;
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="relative flex h-4 w-24 shrink-0 items-center sm:w-28">
        {tone === "unknown" ? (
          <span
            className="w-full border-t-2 border-dashed"
            style={{ borderColor: "hsl(var(--line-dim))" }}
          />
        ) : (
          <span
            className={`${STROKE[tone]} ${metered ? "h-px" : "h-[2px]"} ${
              end === "bar" ? "w-[calc(100%-3px)]" : "w-full"
            }`}
          />
        )}
        {end === "bar" ? (
          <span className="absolute right-0 h-4 w-[3px] rounded-sm bg-stopped" />
        ) : end === "node" && tone !== "unknown" ? (
          <span
            className={`absolute right-0 size-2 rounded-full ${STROKE[tone]}`}
            style={{ transform: "translateX(50%)" }}
          />
        ) : null}
      </span>
      {label ? (
        <span className={`font-mono text-[12.5px] ${INK[tone]}`} data-fact>
          {label}
        </span>
      ) : null}
    </span>
  );
}

type Cell = { branches: BranchSpec[]; say: string; tone: Tone };

type Rung = {
  rate: string;
  tone: Tone;
  ours: Cell;
  theirs: Cell;
};

const rungs: Rung[] = [
  {
    rate: "0.10%",
    tone: "acted",
    ours: {
      tone: "acted",
      branches: [{ tone: "acted", end: "node" }],
      say: "rootmail warns you, and names the client",
    },
    theirs: {
      tone: "unknown",
      branches: [{ tone: "unknown", end: "open" }],
      say: "nothing is said",
    },
  },
  {
    rate: "0.30%",
    tone: "acted",
    ours: {
      tone: "acted",
      branches: [{ tone: "acted", metered: true, end: "node" }],
      say: "throttled to 60 sends an hour",
    },
    theirs: {
      tone: "unknown",
      branches: [{ tone: "unknown", end: "open" }],
      say: "nothing is said",
    },
  },
  {
    rate: "0.50%",
    tone: "stopped",
    ours: {
      tone: "stopped",
      branches: [
        { tone: "stopped", end: "bar", label: "harbourclinic.com" },
        { tone: "witnessed", end: "open", label: "your other clients" },
      ],
      say: "one client is paused. Everyone else keeps sending.",
    },
    theirs: {
      tone: "stopped",
      branches: [{ tone: "stopped", end: "bar", label: "every client" }],
      say: "the provider suspends the whole account. You hear it from a customer.",
    },
  },
];

function Column({ name, cell, kind }: { name: string; cell: Cell; kind: "ours" | "theirs" }) {
  return (
    <div
      className={
        // The tray-and-lift vocabulary the deck, the defaults list, the pricing
        // meters and the FAQ all use. `--card` and `--well` are the only pair
        // that keeps its DIRECTION when the band flips in dark mode: on a light
        // page the tray is 7% and our card 14%; on a dark page the tray is 90%
        // and our card 99%. `--secondary` was tried first and collapses in the
        // flipped case, where it lands within three points of the well.
        kind === "ours"
          ? "rounded-xl bg-card px-4 py-4 shadow-e2"
          : "rounded-xl px-4 py-4"
      }
    >
      <p className="text-[13px] text-ink-muted">{name}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {cell.branches.map((b, i) => (
          <Branch key={i} spec={b} />
        ))}
      </div>
      <p className={`mt-3 max-w-[34ch] text-[13px] leading-snug ${INK[cell.tone]}`}>{cell.say}</p>
    </div>
  );
}

export function ThresholdLadder() {
  return (
    <div className="mt-10 lg:mt-0">
      <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
        complaint rate · harbourclinic.com · 7-day window
      </p>

      <div className="mt-5 rounded-2xl bg-well p-3 shadow-well sm:p-4">
        {rungs.map((r) => (
          <div key={r.rate} className={`rise border-l-2 py-5 pl-4 sm:pl-6 ${RAIL[r.tone]}`}>
            <p className={`display-num text-[1.75rem] leading-none ${INK[r.tone]}`}>{r.rate}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Column name="rootmail" cell={r.ours} kind="ours" />
              <Column name="the common default" cell={r.theirs} kind="theirs" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-muted">
        7-day trailing window, never on fewer than 20 sends the provider ruled on.
      </p>
    </div>
  );
}

export function TheBreak() {
  return (
    <section className="slab settle ground-ink lit-edge">
      <div className="container py-16 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <div className="lg:sticky lg:top-28">
              <h2 className="display-l text-balance">
                Email fails quietly. The number on the screen keeps going up.
              </h2>
              <p className="lead mt-6 max-w-md text-ink-muted">
                The fix is not a better chart. It is an account of every sender, and acting on it
                before a person has to.
              </p>
            </div>
          </div>

          <ThresholdLadder />
        </div>
      </div>
    </section>
  );
}
