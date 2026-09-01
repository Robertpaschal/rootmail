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
 * 3. `what usually happens` names nobody. It is a structural claim about what a
 *    system without per-sender scoring is ABLE to say, which is the only form
 *    of comparison that ships here.
 *
 * ── THE STORY PASS (2026-08-31): EVERY FIGURE NOW SAYS WHAT IT IS ───────────
 * The owner, reading the finished page as a stranger: *"I don't understand
 * what these numbers are for — 0.1%, 0.3%, 0.5%. What are those about? What
 * are you trying to show? And then 'complaint rate · harbourclinic.com ·
 * 7-day window' — that second part is confusing."*
 *
 * Both halves were the same failure. A `.display-num` figure with a mono
 * sourcing line beside it satisfies the LETTER of §5.3 (a number ships with
 * its window and its method) and misses the point entirely: the window and
 * the method are not what the reader was missing. They were missing **what
 * the measure is and why anyone should care**, which no sourcing line has
 * ever said.
 *
 * So: a prose block above the ladder names the measure, says who watches it
 * and states that these three points are OURS, set under the provider's own —
 * and every rung carries a `gloss` that translates the percentage into people
 * ("1 person in every 1,000 marked it as spam"). `gloss` is a required field
 * on `Rung`, so a rung cannot be added without one. The sourcing line is
 * still there; it is now a footnote under the ladder, in words, where a
 * footnote belongs.
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

type Cell = {
  branches: BranchSpec[];
  say: string;
  tone: Tone;
  /**
   * THE RUNG AT WHICH THIS COLUMN'S READER LEARNS ANYTHING AT ALL.
   *
   * The owner, on the version without it: *"you're trying to make a
   * distinction between what rootmail does and what others do, but it's not
   * clear that's what you mean … we can present it in a better format that
   * would make people understand that **rootmail allows you to see the spam
   * problem at an early stage, rather than you not knowing how spammy your
   * email has become to your receivers.**"*
   *
   * That is the argument of the whole section and the ladder was leaving the
   * reader to derive it by comparing six cells. It is marked now: exactly ONE
   * cell per column carries `found`, and the two are three rungs apart. The
   * distance between the two marks IS the product.
   */
  found?: string;
};

type Rung = {
  rate: string;
  /** What the figure MEANS, in words, right next to it. Never optional. */
  gloss: string;
  tone: Tone;
  ours: Cell;
  theirs: Cell;
};

const rungs: Rung[] = [
  {
    rate: "0.10%",
    gloss: "1 person in every 1,000 marked it as spam",
    tone: "acted",
    ours: {
      tone: "acted",
      branches: [{ tone: "acted", end: "node" }],
      say: "rootmail emails you, and names the client whose mail it is",
      found: "This is where you find out",
    },
    theirs: {
      tone: "unknown",
      branches: [{ tone: "unknown", end: "open" }],
      say: "nothing happens, and nobody tells you",
    },
  },
  {
    rate: "0.30%",
    gloss: "3 people in every 1,000 marked it as spam",
    tone: "acted",
    ours: {
      tone: "acted",
      branches: [{ tone: "acted", metered: true, end: "node" }],
      say: "that client is slowed to 60 emails an hour \u2014 held back, never dropped",
    },
    theirs: {
      tone: "unknown",
      branches: [{ tone: "unknown", end: "open" }],
      say: "nothing happens, and nobody tells you",
    },
  },
  {
    rate: "0.50%",
    gloss: "5 people in every 1,000 marked it as spam",
    tone: "stopped",
    ours: {
      tone: "stopped",
      branches: [
        { tone: "stopped", end: "bar", label: "harbourclinic.com" },
        { tone: "witnessed", end: "open", label: "your other clients" },
      ],
      say: "that one client is stopped. Everyone else keeps sending.",
    },
    theirs: {
      tone: "stopped",
      branches: [{ tone: "stopped", end: "bar", label: "every client" }],
      say: "your email provider suspends the whole account. You hear about it from a customer.",
      found: "This is where you find out",
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
      {/* The column name repeats here only where the header row above the
          ladder is not on screen. Above `sm` the grid is two columns and the
          header sits over them; below it the cells stack and each one has to
          say which side it is. */}
      <p className="text-[13px] text-ink-muted sm:hidden">{name}</p>
      <div className="mt-3 flex flex-col gap-2.5 sm:mt-0">
        {cell.branches.map((b, i) => (
          <Branch key={i} spec={b} />
        ))}
      </div>
      <p className={`mt-3 max-w-[34ch] text-[13px] leading-snug ${INK[cell.tone]}`}>{cell.say}</p>
      {cell.found ? (
        <p
          className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-medium ${INK[cell.tone]}`}
        >
          <span aria-hidden="true" className={`h-[2px] w-4 rounded-sm ${STROKE[cell.tone === "unknown" ? "acted" : cell.tone]}`} />
          {cell.found}
        </p>
      ) : null}
    </div>
  );
}

export function ThresholdLadder() {
  return (
    <div className="mt-10 lg:mt-0">
      {/* WHAT THE NUMBERS ARE. The owner, on the version without this block:
          *"I don't understand what these numbers are for — 0.1%, 0.3%, 0.5%.
          What are those about?"* Three bare percentages with a mono caption
          reading `complaint rate · harbourclinic.com · 7-day window` is a
          figure a reader cannot interpret, which by our own rule is a figure
          that may not ship. So: what the measure is, why anyone should care,
          and whose numbers these are — in prose, above the ladder. */}
      <h3 className="display-s text-balance">
        Complaint rate: how many people hit &ldquo;mark as spam&rdquo;
      </h3>
      <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-muted">
        Out of everyone you mailed. It is the number mailbox providers use to decide whether the
        rest of your email is worth delivering, and it moves slowly enough that by the time you
        notice, weeks of mail have already gone to spam folders.
      </p>
      <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-muted">
        The three points below are <em>ours</em>. We set them deliberately under the point where an
        email provider starts acting on its own — because when the provider acts, it acts on your
        whole account, and everything you send stops at once.
      </p>

      <div className="mt-6 rounded-2xl bg-well p-3 shadow-well sm:p-4">
        {/* THE TWO COLUMNS, NAMED ONCE AND LOUDLY. The owner: *"you're trying
            to make a distinction between what rootmail does and what others
            do, but it's not clear that's what you mean. You just see 'rootmail
            does this, what usually happens'."* They were 13px muted captions
            repeated inside all six cells — the same size and colour as the
            sentence underneath them, so the comparison was a caption rather
            than the frame. It is a header row at heading size now, drawn once
            over the grid it labels, and the cells no longer repeat it above
            `sm`. Both names are written in the SECOND PERSON so the axis is
            "what YOU see", which is what the section is actually about. */}
        <div className="hidden gap-4 border-b border-rule px-4 pb-3 sm:grid sm:grid-cols-2">
          <p className="display-s">What you see with rootmail</p>
          <p className="display-s text-ink-muted">What you see without it</p>
        </div>

        {rungs.map((r) => (
          <div key={r.rate} className={`rise border-l-2 py-5 pl-4 sm:pl-6 ${RAIL[r.tone]}`}>
            {/* THE WORDS LEAD, THE FIGURE SOURCES. The owner: *"'0.1% — one
                person in every 1,000 marked it as spam' — I understand what
                you're trying to do but it's not immediately clear."* It was a
                1.75rem figure with the plain-English translation set beside it
                at 13px muted — so the thing a reader could actually parse was
                the quietest thing in the row, and the thing they could not was
                the loudest. Swapped. The percentage is still here, still in
                the display face, still tone-coloured; it is now the second
                thing read rather than the first, and it is captioned so the
                bare number never has to stand alone. */}
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="display-s text-balance">{r.gloss}</p>
              <p className="flex items-baseline gap-1.5">
                <span className={`display-num text-[1.5rem] leading-none ${INK[r.tone]}`}>
                  {r.rate}
                </span>
                <span className="text-[12.5px] text-ink-muted">complaint rate</span>
              </p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Column name="rootmail does this" cell={r.ours} kind="ours" />
              <Column name="what usually happens" cell={r.theirs} kind="theirs" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-rule pt-4 text-xs leading-relaxed text-ink-muted">
        Example figures for one client, counted over the last 7 days — and never on fewer than 20
        emails the mail provider actually ruled on, so one bad afternoon on a brand-new client
        cannot trip it.
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
                When email stops working, nobody tells you.
              </h2>
              <p className="lead mt-6 max-w-md text-ink-muted">
                It does not break. It quietly starts landing in spam folders, and you find out
                from a customer three weeks later asking why they never got their receipt.
              </p>
              <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
                Two numbers decide it: how many of your addresses reject the mail, and how many
                people mark it as spam. rootmail watches both, separately for every sender on your
                account, and does something about them before anybody has to notice.
              </p>
              {/* THE SENTENCE THE SECTION IS FOR. The owner, after reading the
                  ladder: *"we can present it in a better format that would
                  make people understand that **rootmail allows you to see the
                  spam problem at an early stage, rather than you not knowing
                  how spammy your email has become to your receivers.**"* That
                  is the claim; it was implied by a drawing and stated nowhere,
                  so it is stated here, and the two marked cells in the ladder
                  are the evidence for it. */}
              <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed">
                The whole job is to move the moment you find out. With rootmail that moment is one
                complaint in a thousand, while it is still a list you can fix. Without it the
                moment is the one where a mail provider has already decided about you — and by
                then the decision covers everything you send.
              </p>
            </div>
          </div>

          <ThresholdLadder />
        </div>
      </div>
    </section>
  );
}
