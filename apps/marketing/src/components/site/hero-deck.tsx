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
 * exact pattern `globals.css` already documents for the one-message panel
 * (`.om`); it is used again here for the same reason it was used there.
 *
 * The scroll rig (`deck-scroll.tsx`) does ONE thing: as the reader moves
 * through the pinned hero it sets `checked` on the radio for the beat they are
 * in. It never creates content, never removes any, and if it never runs — a
 * frozen tab, a failed chunk, no script at all — the deck is a working tab set
 * sitting on its first record. That is the whole safety argument, and it is why
 * the driver is eleven lines rather than a state machine.
 *
 * WHY FOUR HEADS ARE ALWAYS VISIBLE. The brief's rule is that rotation must
 * never be the only way to see content. Every record's kind, subject and LINE
 * are on screen at rest — including the severed one — so a reader who never
 * touches anything has already been told that rootmail tracks receipts,
 * campaigns and replies, and stops a send that bounced. Opening a record adds
 * its ledger; it does not reveal its existence.
 */
export function HeroDeck() {
  return (
    <div className="deck rounded-2xl bg-well p-2 shadow-well">
      {/* The radios come FIRST and are direct children, because every rule in
          globals.css reaches from `#rec-N:checked` through `~ .deck-rows`.
          Reorder these and the deck stops opening. */}
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

      <div className="deck-rows">
        {HERO_RECORDS.map((r, i) => (
          <div key={r.key} data-row={i} className="deck-row">
            {/* One row at `sm` and up; two below it, where a kind, a subject
                and a 111px glyph on one line would leave the subject about
                eighty pixels to be truncated into. DOM order stays
                kind → subject → glyph, which is the reading order; only the
                narrow layout reorders, and only visually. */}
            <label
              htmlFor={`rec-${i}`}
              data-head={i}
              className="deck-head flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
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

            <div data-rec={i} className="deck-body px-3 pb-3">
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

      <DeckScroll count={HERO_RECORDS.length} />
    </div>
  );
}
