import { Line, type Station } from "@rootmail/design";

/**
 * "What happens if you change nothing" — five defaults, both ways round.
 *
 * ── WHAT CHANGED (2026-08-31), AND WHY ──────────────────────────────────────
 * Each row used to carry a two-segment `default | here` switch, and flipping it
 * swapped the drawing IN PLACE. The owner: *"the bottom, the default… doesn't
 * feel well done. The design just seems like 'oh, we have a white unshaped
 * cutting'… every single one of them has a default here. It doesn't feel well
 * done."*
 *
 * Measured on the built page, that verdict is literal. A row reported
 * `background-color: rgba(0,0,0,0)` and `box-shadow: none` on a section ground
 * of `rgb(254,253,251)` — **the row had no shape at all**, in either state, and
 * the two states differed only in which SVG occupied the same undifferentiated
 * white area. Worse for the argument: the comparison was never visible. A
 * reader could see our default, or the industry's, but never the two together —
 * which is the only thing the section is trying to say.
 *
 * ── THE SHAPE IT HAS NOW ────────────────────────────────────────────────────
 * **Both at once, on two different planes.** The list sits in a pressed tray
 * (`bg-well`); our answer is a card lifted OUT of the tray; the common default
 * stays down in it. The contrast between two options is now a physical fact
 * about the surfaces rather than a state a control has to be operated to reach,
 * and there is no undifferentiated white area left anywhere in the section.
 *
 * Three consequences worth stating, because each removes a class of bug:
 *
 * 1. **There is no client state, so this is a server component now.** No
 *    `useState`, no switch, no `Show me all five`. What the reader can see does
 *    not depend on a hydration boundary, a frozen frame, or a bundle arriving.
 * 2. **Nothing was lost with the toggle.** Its only job was to reveal the
 *    comparison; the comparison is permanent. A control whose entire purpose is
 *    served better by the layout is not a capability being removed.
 * 3. **The screenshot problem solved itself.** The old flip was opt-in because
 *    one press turned the whole section dotted and severed, which is the most
 *    screenshot-prone frame a page can have. Paired columns cannot produce that
 *    frame: our side is in every crop of theirs.
 *
 * ── THE HONESTY GUARD (what decides whether a row may ship) ──────────────────
 * `the common default` names nobody, and every row must be a STRUCTURAL fact
 * about a mechanism rather than a strawman about a company: what a single
 * unscoped suppression list does to a transactional message; what a *simulated*
 * sandbox is able to report about a message that never left; what a screenshot
 * proves. If a row cannot be stated that way, the row does not ship.
 *
 * Row 3 is the rendering law turned on the category's founding lie — a sandbox
 * reporting a solid `Delivered` for a message that never left the building. We
 * draw it under exactly the law we draw ourselves under.
 */

type Row = {
  title: string;
  /** The sourcing line `00-PHILOSOPHY.md` §5.3 requires, for OUR side. */
  where: string;
  here: Station[][];
  common: Station[][];
  /** The word the other side's drawing needs. */
  commonNote: string;
};

const rows: Row[] = [
  {
    title: "We don't ask you to leave your provider",
    where: "credentials checked live before they are stored",
    here: [
      [
        { label: "your provider", state: "witnessed" },
        { label: "rootmail", state: "witnessed" },
        { label: "your customers", state: "witnessed" },
      ],
    ],
    common: [
      [
        { label: "your provider", state: "witnessed" },
        { label: "migrate", state: "stopped", reason: "start the reputation over" },
      ],
    ],
    commonNote: "warm-up history starts again at zero",
  },
  {
    title: "Unsubscribing stops the newsletter, not the password reset",
    where: "enforced in the send pipeline · scoped by message type",
    here: [
      [
        { label: "newsletter", state: "witnessed" },
        { label: "opted out", state: "stopped" },
      ],
      [
        { label: "password reset", state: "witnessed" },
        { label: "delivered", state: "witnessed" },
      ],
    ],
    common: [
      [
        { label: "newsletter", state: "witnessed" },
        { label: "opted out", state: "stopped" },
      ],
      [
        { label: "password reset", state: "witnessed" },
        { label: "suppressed", state: "stopped" },
      ],
    ],
    commonNote: "one unscoped list stops both",
  },
  {
    title: "The sandbox doesn't lie to you",
    where: "test sends excluded from scoring",
    here: [
      [
        { label: "test send", state: "witnessed" },
        { label: "provider", state: "witnessed" },
        { label: "delivered", state: "witnessed" },
      ],
    ],
    common: [
      [
        { label: "test send", state: "witnessed" },
        { label: "delivered", state: "witnessed", at: "simulated" },
      ],
    ],
    commonNote: "nothing left the building",
  },
  {
    title: "A data request you can answer the same day",
    where: "one export call · one erase call",
    here: [
      [
        { label: "export", state: "witnessed" },
        { label: "erase", state: "witnessed" },
        { label: "opt-out", state: "witnessed" },
      ],
    ],
    common: [
      [
        { label: "export", state: "unknown" },
        { label: "erase", state: "unknown" },
      ],
    ],
    commonNote: "and the opt-out goes with the record",
  },
  {
    title: "Proof you can hand to someone else",
    where: "signed · independently verifiable · content hash included",
    here: [
      [
        { label: "signed bundle", state: "witnessed" },
        { label: "content hash", state: "witnessed" },
      ],
    ],
    common: [[{ label: "screenshot", state: "unknown" }]],
    commonNote: "checkable by nobody",
  },
];

export function Promises() {
  return (
    <section className="slab settle lit">
      <div className="container grid gap-10 py-14 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <div className="lg:sticky lg:top-28">
            <h2 className="display-l text-balance">What happens if you change nothing</h2>
            <p className="lead mt-5 max-w-sm text-ink-muted">
              Five defaults, set the way we would want them set for our own mail — beside the way
              they are usually set.
            </p>
          </div>
        </div>

        {/* The tray. Our five answers are lifted out of it; the common default
            stays down in it. Depth is doing the comparing, so nothing has to be
            switched, and the section is complete before any script runs. */}
        <div className="rounded-2xl bg-well p-2 shadow-well sm:p-3">
          <div className="ruled">
            {rows.map((r) => (
              <div key={r.title} className="px-1 py-4 sm:px-2">
                <h3 className="display-s max-w-lg text-balance px-2">{r.title}</h3>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {/* OURS — on the raised ground, with elevation under it.
                      `--background` moves with the plane so the line's
                      knockout ring matches the card and not the page. */}
                  <div
                    className="rounded-xl bg-card p-4 shadow-e1"
                    style={{ "--background": "var(--card)" } as React.CSSProperties}
                  >
                    <p className="text-[13px] font-medium">rootmail</p>
                    <div className="mt-3 flex flex-col gap-3 overflow-x-auto pb-1">
                      {r.here.map((d, j) => (
                        <Line key={j} stations={d} scale="page" />
                      ))}
                    </div>
                    <p className="mt-3 font-mono text-[12.5px] text-ink-muted" data-fact>
                      {r.where}
                    </p>
                  </div>

                  {/* THEIRS — left in the tray. No fill of its own, because the
                      tray IS its ground; that is the whole visual argument. */}
                  <div
                    className="rounded-xl px-4 py-4"
                    style={{ "--background": "var(--well)" } as React.CSSProperties}
                  >
                    <p className="text-[13px] text-ink-muted">the common default</p>
                    <div className="mt-3 flex flex-col gap-3 overflow-x-auto pb-1">
                      {r.common.map((d, j) => (
                        <Line key={j} stations={d} scale="page" />
                      ))}
                    </div>
                    <p className="mt-3 font-mono text-[12.5px] text-stopped" data-fact>
                      {r.commonNote}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
