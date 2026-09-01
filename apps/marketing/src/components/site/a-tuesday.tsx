/**
 * "WHAT DOES AN ORDINARY DAY LOOK LIKE?" — new 2026-08-31, drawn as a line
 * across the page 2026-09-01, and dealt as a DECK later the same day.
 *
 * The owner named two questions the old page answered and the rewritten one
 * did not: **who is it for**, and **what another Tuesday looks like**. This is
 * the second. It exists because every other section on this page is an
 * argument, and a stranger deciding whether to sign up is not weighing an
 * argument — they are trying to picture themselves using the thing.
 *
 * ── WHY A DAY, RATHER THAN A FEATURE LIST ───────────────────────────────────
 * A feature list makes the reader assemble the product in their head. A day
 * hands it to them assembled, and it carries the differentiators *sideways*,
 * where they land as ordinary competence rather than as boasting:
 *
 *   06:00  scheduled campaigns
 *   09:14  transactional send through the API, four seconds end to end
 *   11:47  shared reply inbox, and a sequence that exits on reply
 *   14:20  automatic suppression on a hard bounce
 *   16:05  SCOPED unsubscribe — the doctrine COLLAB.md lists as unmentioned
 *          anywhere public, shipped and never claimed
 *   22:00  hourly DNS re-checks, with the latency in the sentence
 *
 * The last row is the one to keep: the ordinary day ends with nothing
 * happening, and saying so is more honest than inventing a crisis.
 *
 * ── FROM A LINE TO A DECK, AND WHAT HAD TO SURVIVE THE MOVE ────────────────
 * The owner asked for the deck in "who is it for" and then: *"The same thing
 * can be applied to 'What an ordinary Tuesday looks like' as well."* Variations
 * of it — so the rig is shared and four things differ, each for a reason that
 * belongs to this content rather than to the rig. They are listed in
 * `globals.css` under "AN ORDINARY TUESDAY — THE DECK'S VARIATION"; the short
 * version is that this deck runs the other way (a day runs left to right, so
 * the hours still to come fan out to the RIGHT), it turns on Y rather than X,
 * its left box is a clock rather than an icon, and **every card carries the
 * whole day at its foot**.
 *
 * That last one is the load-bearing part. The section's argument is *exactly
 * one of these six hours needed somebody at a desk*, and the previous version
 * made it VISIBLE rather than asserting it: one hollow ring in a row of six
 * filled ones. A deck shows one card at a time, so the row had to come with
 * it or the argument would have quietly become a claim again. It is now a
 * six-node ruler along the bottom of every card, current hour ringed.
 *
 * Word for word, the beats and the legend are unchanged. The only copy that
 * MOVED is the heading arrangement: the section name is the eyebrow and the
 * heading is centred and bold, which is what the owner asked for.
 *
 * ── EVERY ROW IS TRUE, AND HERE IS WHERE ────────────────────────────────────
 * - the reply exit: `sequence_exited_on_reply`, worker sequence step guard.
 * - the bounce → suppression: the send pipeline suppresses before the next
 *   send; `packages/db/suppression.ts` and its tests.
 * - the scoped unsubscribe: suppression rows carry a scope, and the marketing
 *   scope does not stop a transactional message. This is the row in
 *   `promises.tsx` too, said there as a comparison and here as a Tuesday.
 * - "within the hour": `DNS_RECHECK_INTERVAL_MINUTES = 60`, and the drift path
 *   both sends mail and fires a `tenant.dns_drifted` webhook
 *   (`apps/worker/src/dns-drift.ts`).
 *
 * ── THE LAWS ────────────────────────────────────────────────────────────────
 * Server component, no state, no script. Times are recorded values, so they
 * are in the display face as figures; everything else is prose. The node
 * colours obey the rendering law — and the hour a HUMAN was involved takes no
 * signal colour at all, because a person is not a message state. Nothing in
 * this section is ever `opacity: 0`: with JavaScript disabled, on a phone, on
 * a short window or under `prefers-reduced-motion` it is a plain list of six
 * cards and the legend above them.
 */

type Beat = {
  at: string;
  /** The whole beat in a handful of words. This is what most readers will read. */
  title: string;
  /**
   * What happened at this hour, in the rendering law's terms.
   *   watched — recorded, and nothing needed doing
   *   acted   — rootmail did something about it
   *   person  — somebody at a desk did something. NOT a signal colour: a
   *             person is not a message state, so this node is a hollow ring
   *             in plain ink. It is the only hollow one in the row.
   */
  by: "watched" | "acted" | "person";
  detail: string;
};

const DAY: Beat[] = [
  {
    at: "06:00",
    by: "watched",
    title: "The newsletter goes out",
    detail: "4,812 subscribers. You wrote it yesterday and scheduled it.",
  },
  {
    at: "09:14",
    by: "watched",
    title: "A room gets booked",
    detail: "Your website asks. Delivered from your address four seconds later.",
  },
  {
    at: "11:47",
    by: "person",
    title: "She asks about a late checkout",
    detail:
      "It lands in the shared inbox, original underneath. Tomorrow's follow-up cancels itself.",
  },
  {
    at: "14:20",
    by: "acted",
    title: "One address no longer exists",
    detail:
      "The mail bounces. On your do-not-send list the same second, so it never counts twice.",
  },
  {
    at: "16:05",
    by: "acted",
    title: "Somebody unsubscribes",
    detail:
      "The newsletter stops. Their receipts and password resets keep coming — that is what they asked for.",
  },
  {
    at: "22:00",
    by: "watched",
    title: "Nothing happens",
    detail:
      "Your DNS was re-checked every hour. Had a record gone, you would have had an email within the hour, and six hours to put it back.",
  },
];

const LEGEND: { by: Beat["by"]; say: string }[] = [
  { by: "watched", say: "recorded, nothing needed doing" },
  { by: "acted", say: "rootmail did something about it" },
  { by: "person", say: "somebody had to act — one hour out of six" },
];

/** The legend's own words, on the card, so a card read alone still says what
    kind of hour it was. Nothing new is written here. */
const SAYS: Record<Beat["by"], string> = {
  watched: "recorded, nothing needed doing",
  acted: "rootmail did something about it",
  person: "somebody had to act",
};

export function ATuesday() {
  return (
    <section
      id="a-day"
      className="deck-rig slab settle lit"
      data-run="right"
      style={{ "--deck-steps": DAY.length - 1 } as React.CSSProperties}
    >
      <div className="deck-pin">
        <div className="container text-center">
          <p className="deck-eyebrow">An ordinary Tuesday</p>
          <h2 className="display-l mx-auto mt-4 max-w-3xl text-balance">
            What an ordinary Tuesday looks like
          </h2>
          <p className="lead mx-auto mt-4 max-w-2xl text-ink-muted">
            One small business, one day, nothing on fire. This is the whole product at the size
            most people actually use it — and exactly one of these six hours needed somebody at a
            desk.
          </p>

          {/* The key. Three node kinds and what each one means, said once, so
              the ruler along the foot of every card can be read rather than
              decoded. It is above the deck rather than under it because a
              legend after the drawing is a footnote and a legend before it is
              an instruction. */}
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {LEGEND.map((l) => (
              <li key={l.by} className="flex items-center gap-2.5 text-[13px] text-ink-muted">
                <span aria-hidden="true" className="day-node" data-kind={l.by} />
                {l.say}
              </li>
            ))}
          </ul>
        </div>

        <ol className="deck-stage container">
          {DAY.map((b, i) => (
            <li key={b.at} className="deck-card" style={{ "--i": i } as React.CSSProperties}>
              <article className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-e2 sm:flex-row sm:items-stretch sm:gap-7 sm:p-8">
                {/* The box on the left is the clock. A recorded hour is a
                    value, so it is set in the display face; the node beside it
                    says what kind of hour it was. */}
                <div className="flex shrink-0 items-center justify-between gap-5 rounded-xl bg-well p-4 shadow-well sm:w-48 sm:flex-col sm:items-start sm:justify-start sm:p-5">
                  <p className="display-num text-[1.75rem] leading-none sm:text-[2.25rem]" data-fact>
                    {b.at}
                  </p>
                  <p className="flex items-center gap-2.5 text-[12.5px] leading-snug text-ink-muted sm:mt-4">
                    <span aria-hidden="true" className="day-node" data-kind={b.by} />
                    <span className="hidden sm:inline">{SAYS[b.by]}</span>
                  </p>
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <h3 className="display-m text-balance">{b.title}</h3>
                  <p className="mt-3 max-w-[46ch] text-[1rem] leading-relaxed text-ink-muted">
                    {b.detail}
                  </p>

                  {/* The whole day, on every card. This is the horizontal line
                      the deck replaced, kept because the section's argument —
                      one hollow ring among six — is only visible if all six
                      are. */}
                  <ul className="day-ruler mt-6 border-t border-rule pt-5" aria-hidden="true">
                    {DAY.map((o, j) => (
                      <li key={o.at} className="flex items-center">
                        <span className="day-node" data-kind={o.by} data-here={j === i} />
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
