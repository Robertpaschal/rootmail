/**
 * "WHAT DOES AN ORDINARY DAY LOOK LIKE?" — new 2026-08-31, drawn as a line
 * across the page 2026-09-01.
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
 * ── WHAT CHANGED, AND THE ONE RULE THAT GOVERNED THE CUT ────────────────────
 * The owner: *"the storytelling can be improved with the visuals — how it
 * wipes across and how it is presented … it still feels like you'll be reading
 * both sides. The less you make people read and the more intuitive and
 * contextual, the more engaging. Rather than just having it show in a box of
 * how things go."*
 *
 * It was a sticky left rail — heading, lead AND a 44-word summary — beside six
 * rows of 40-word prose. Two columns to read, and the summary said what the
 * rows said. It is one horizontal rail of six stations now, ~240 words of
 * prose down to ~90, and the geometry is in `globals.css`.
 *
 * **THE RULE FOR THE CUT: a sentence could go only where the ARRANGEMENT now
 * says it.** The summary paragraph went because the row of nodes says it — one
 * hollow ring among five filled ones is "exactly one of these needed a
 * person", drawn instead of asserted. Nothing went because it was long. The
 * DNS latency in the last beat is the clearest case: `docs/COLLAB.md` (Cowork,
 * 18 Aug) says explicitly to ship that claim WITH the latency in it, never
 * without, so that beat stayed the wordiest of the six on purpose.
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
 * Server component, no state. The only motion is the spine's sweep, which is a
 * PSEUDO-ELEMENT — so it cannot hold content by construction — drawn over a
 * spine that is already complete. Times are recorded values, so they are in
 * the display face as figures; everything else is prose. The node colours obey
 * the rendering law and the spine deliberately does not use it at all; see the
 * long note in `globals.css`, which is the place to read before changing the
 * vocabulary.
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

export function ATuesday() {
  return (
    <section id="a-day" className="slab settle lit">
      <div className="container py-14 md:py-24">
        <div className="max-w-2xl">
          <h2 className="display-l text-balance">What an ordinary Tuesday looks like</h2>
          <p className="lead mt-5 text-ink-muted">
            One small business, one day, nothing on fire. This is the whole product at the size
            most people actually use it — and exactly one of these six hours needed somebody at a
            desk.
          </p>
        </div>

        {/* The key. Three node kinds and what each one means, said once, so the
            row below can be read rather than decoded. It is above the rail
            rather than under it because a legend after the drawing is a
            footnote and a legend before it is an instruction. */}
        <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
          {LEGEND.map((l) => (
            <li key={l.by} className="flex items-center gap-2.5 text-[13px] text-ink-muted">
              <span
                aria-hidden="true"
                className="day-node !static !left-auto !top-auto !shadow-none"
                data-kind={l.by}
              />
              {l.say}
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-2xl bg-well p-5 shadow-well sm:p-6">
          <ol className="day-track">
            {DAY.map((b) => (
              <li key={b.at} className="day-beat">
                <span aria-hidden="true" className="day-node" data-kind={b.by} />
                <p className="display-num text-[1.25rem] leading-none" data-fact>
                  {b.at}
                </p>
                <h3 className="display-s mt-2.5 text-balance">{b.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{b.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
