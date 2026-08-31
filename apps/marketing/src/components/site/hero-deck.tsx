import { Line, LiveLine } from "@rootmail/design";
import { HERO_RECORDS } from "./hero-records";
import { DeckScroll } from "./deck-scroll";

/**
 * THE DECK — four real records in one tray, one of them open.
 *
 * `docs/design/05-ENGAGEMENT.md` §5.1 asked for a scene the scrollbar indexes
 * into, and §1.4 disqualified the way Wispr builds one: content that exists
 * only because a scroll handler ran. This is the compliant version of the same
 * mechanic, and the compliance is structural rather than careful:
 *
 * **THE DECK IS FOUR RADIO INPUTS AND A SIBLING COMBINATOR.** No React state,
 * no `useState`, no effect. The open record is whichever radio is checked, and
 * every one of the four is reachable with a click, with the Tab and arrow keys,
 * and by a screen reader — with the JavaScript bundle deleted. This is the
 * exact pattern `globals.css` already documents for the one-message panel; it
 * is used again here for the same reason it was used there.
 *
 * The scroll rig (`deck-scroll.tsx`) does ONE thing: as the reader moves
 * through the pinned hero it sets `checked` on the radio for the beat they are
 * in. It never creates content, never removes any, and if it never runs — a
 * frozen tab, a failed chunk, no script at all — the deck is a working tab set
 * sitting on its first record.
 *
 * WHY FOUR HEADS ARE ALWAYS VISIBLE. The brief's rule is that rotation must
 * never be the only way to see content. Every record's kind, subject and LINE
 * are on screen at rest — including the severed one — so a reader who never
 * touches anything has already been told that rootmail tracks receipts,
 * campaigns and replies, and stops a send that bounced. Opening a record adds
 * its ledger; it does not reveal its existence.
 *
 * ── WHAT CHANGED (2026-08-31) ───────────────────────────────────────────────
 * The owner, on the hero: *"if we can implement the kind of depth we did for
 * the 'email fails quietly' section in the main header section… the critique is
 * the colour distinction, the elevation of depth, the presentation of
 * information… we can improve what we do with that left side so the person
 * feels engaged taking in the information."*
 *
 * Three structural moves, in the order they answer that:
 *
 * 1. **The radios were hoisted out of this file into the hero grid.** They are
 *    now direct children of `.deck`, which is the GRID, so a sibling
 *    combinator reaches BOTH columns. That is what lets the left side respond
 *    to the deck at all — with no script, still.
 * 2. **The left side got the index** (`HeroDeckIndex`). Four rows, one per
 *    record, every one of them fully readable at rest: kind, one plain-words
 *    note, and a node in the record's verdict colour. The active row is filled
 *    and full-ink. It is a contents page for the scene, so a reader knows
 *    there are four things here and which one they are on — which is the
 *    engagement ask — without a single word being hidden to achieve it.
 * 3. **The tray got the ladder's depth vocabulary**: a mono sourcing line
 *    above it (`break.tsx` has one and the deck did not), a verdict rail down
 *    the left of every row, and `e3` under the open one where it used to be
 *    `e2`. The rail is the colour distinction, and it is lawful: `verdict` is
 *    what we OBSERVED about the message — delivered, or stopped — never a
 *    summary that would launder an inferred station into a witnessed one.
 */

/** The verdict rail and the index node. Observation only — see `verdict`. */
const RAIL = {
  witnessed: "before:bg-witnessed",
  stopped: "before:bg-stopped",
} as const;

const NODE = {
  witnessed: "bg-witnessed",
  stopped: "bg-stopped",
} as const;

/**
 * The four radios, plus the driver. They must be the FIRST children of `.deck`
 * (the hero grid) — every rule in `globals.css` reaches forward from
 * `#rec-N:checked` with `~`. They are absolutely positioned, so they take no
 * grid track.
 */
export function HeroDeckRadios() {
  return (
    <>
      {HERO_RECORDS.map((r, i) => (
        <input
          key={r.key}
          type="radio"
          name="hero-record"
          id={`rec-${i}`}
          defaultChecked={i === 0}
          className="deck-radio"
        />
      ))}
      <DeckScroll count={HERO_RECORDS.length} />
    </>
  );
}

/**
 * The index, in the copy column. All four rows are readable at rest; the
 * checked one is marked. Nothing here is revealed — the mark moves, the words
 * do not appear.
 */
export function HeroDeckIndex() {
  return (
    <div className="mt-9 max-w-md">
      <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
        four records · one workspace · illustrative
      </p>
      <ol className="deck-index mt-3">
        {HERO_RECORDS.map((r, i) => (
          <li key={r.key}>
            <label
              htmlFor={`rec-${i}`}
              data-tick={i}
              className="deck-tick flex cursor-pointer items-baseline gap-3 py-2"
            >
              <span
                aria-hidden="true"
                className={`deck-tick-node mt-[0.3rem] size-[7px] shrink-0 rounded-full ${NODE[r.verdict]}`}
              />
              <span className="w-[4.5rem] shrink-0 text-[13px] font-medium">{r.kind}</span>
              <span className="deck-tick-note min-w-0 flex-1 text-[12.5px] leading-snug text-ink-muted">
                {r.note}
              </span>
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The tray. Four heads always visible; one body open.
 *
 * `.deck-shell` carries a brass halo as a pseudo-element (`globals.css`). It is
 * decoration, so it is `aria-hidden` by construction and cannot be given
 * information to carry. It does not MOVE: this scene is pinned, and a `view()`
 * timeline on a sticky element never advances — a drifting plate here would sit
 * perfectly still while claiming to be parallax.
 */
export function HeroDeck() {
  return (
    <div className="deck-shell relative">
      <div className="deck-tray rounded-2xl bg-well p-2 shadow-well">
        <div className="deck-rows">
          {HERO_RECORDS.map((r, i) => (
            <div
              key={r.key}
              data-row={i}
              className={`deck-row ${RAIL[r.verdict]}`}
            >
              {/* One row at `sm` and up; two below it, where a kind, a subject
                  and a 111px glyph on one line would leave the subject about
                  eighty pixels to be truncated into. DOM order stays
                  kind → subject → glyph, which is the reading order; only the
                  narrow layout reorders, and only visually. */}
              <label
                htmlFor={`rec-${i}`}
                data-head={i}
                className="deck-head flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-4 pr-3"
              >
                <span className="w-[4.5rem] shrink-0 text-[13px] font-medium">{r.kind}</span>
                <span className="deck-subject order-last w-full min-w-0 truncate text-[13px] text-ink-muted sm:order-none sm:w-auto sm:flex-1">
                  {r.subject}
                </span>
                {/* The glyph that makes the closed rows worth reading: nodes
                    only, at the law's own weights, so a severed record is
                    recognisable as one before it is opened. */}
                <Line
                  stations={r.stations}
                  scale="inline"
                  className="deck-glyph ml-auto shrink-0 sm:ml-0"
                />
              </label>

              <div data-rec={i} className="deck-body pb-3 pl-4 pr-3">
                <p className="flex flex-wrap gap-x-3 border-t border-rule pt-3 font-mono text-[12.5px] text-ink-muted">
                  <span data-fact>{r.id}</span>
                  <span data-fact>{r.to}</span>
                </p>
                <div className="mt-4">
                  <LiveLine
                    stations={r.stations}
                    rows={r.rows}
                    timeline={r.timeline}
                    scale="page"
                    label={`What happened to this ${r.kind}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
