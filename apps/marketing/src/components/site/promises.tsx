/**
 * "What happens if you change nothing" — five defaults, both ways round.
 *
 * ── WHY THE SIGNAL COLOURS LEFT THIS FILE (2026-08-31) ──────────────────────
 * The owner: *"it's good because now the person is going to see what we did,
 * but we can elevate it a bit more. The critique is it's still a bit confusing
 * — it's almost clever. Part of the confusion is the lines, the red lines and
 * the green lines, and the message you're trying to convey is still a bit
 * confusing."*
 *
 * That is not a taste note, it is a category error we shipped, and naming it
 * precisely is the whole fix:
 *
 *   **`witnessed` / `acted` / `stopped` mean something happened to a REAL
 *   MESSAGE.** Green is "a provider confirmed this". Red is "this send ended,
 *   and here is the number that ended it". Every other section on this page
 *   uses them that way, about real records with ids and timestamps.
 *
 *   **This section is not about any message.** It is about how a DEFAULT is
 *   set — a rule, a configuration, a policy that has not run yet. Drawing a
 *   hypothetical in the colours reserved for observations is exactly the move
 *   this product exists to refuse, and a reader who has learned green-means-
 *   delivered four sections earlier is right to be confused when a green line
 *   turns up next to a policy nobody has exercised.
 *
 * So the comparison is drawn in INK, monochrome, at three weights that are
 * about REACHING rather than about outcome — `through`, `blocked`, `absent`.
 * No signal colour appears anywhere in this file. The rendering law is not
 * weakened by that; it is tightened. The signal palette now means "we observed
 * this" *and nothing else on the page borrows it*.
 *
 * ── WHAT MAKES THE COMPARISON READABLE, WHICH WAS THE OTHER HALF ────────────
 * **Both sides now carry the SAME LEFT LABELS, in the same order.** Row 2 is
 * the whole argument in one glance: `newsletter` is stopped on both sides, and
 * `password reset` is the only line that differs. Before, the two sides were
 * two different drawings with two different label sets, so telling them apart
 * meant reading both and holding them in your head. Now the eye compares one
 * column.
 *
 * ── THE SHAPE, UNCHANGED, BECAUSE IT WORKS ──────────────────────────────────
 * **Both at once, on two different planes.** The list sits in a pressed tray
 * (`bg-well`); our answer is a card lifted OUT of the tray; the common default
 * stays down in it. The contrast between two options is a physical fact about
 * the surfaces rather than a state a control has to be operated to reach.
 *
 * 1. **There is no client state, so this is a server component.** What the
 *    reader can see does not depend on a hydration boundary, a frozen frame,
 *    or a bundle arriving.
 * 2. **Nothing is revealed by anything.** Every word of both columns is in the
 *    first paint.
 *
 * ── THE HONESTY GUARD (what decides whether a row may ship) ──────────────────
 * `the common default` names nobody, and every row must be a STRUCTURAL fact
 * about a mechanism rather than a strawman about a company: what a single
 * unscoped suppression list does to a transactional message; what a *simulated*
 * sandbox is able to report about a message that never left; what a screenshot
 * proves. If a row cannot be stated that way, the row does not ship.
 */

/**
 * How far a thing gets under a given default. Deliberately NOT the four station
 * states — see the note above. These describe a rule, not an observation.
 *
 *   through  it reaches the person
 *   blocked  the default stops it, and the bar says where
 *   absent   there is no mechanism, so nothing can be said about it
 */
type Fate = "through" | "blocked" | "absent";

type Outcome = { fate: Fate; say: string };

type Line = { label: string; ours: Outcome; theirs: Outcome };

type Row = {
  title: string;
  /** The sourcing line `00-PHILOSOPHY.md` §5.3 requires, for OUR side. */
  where: string;
  /** The word the other side's column needs. */
  commonNote: string;
  lines: Line[];
};

const rows: Row[] = [
  {
    title: "We don't ask you to leave your provider",
    where: "credentials checked live before they are stored",
    commonNote: "the warm-up history is not portable",
    lines: [
      {
        label: "your provider",
        ours: { fate: "through", say: "still sends the mail" },
        theirs: { fate: "blocked", say: "replaced" },
      },
      {
        label: "your warm-up",
        ours: { fate: "through", say: "kept" },
        theirs: { fate: "blocked", say: "starts again at zero" },
      },
    ],
  },
  {
    title: "Unsubscribing stops the newsletter, not the password reset",
    where: "enforced in the send pipeline · scoped by message type",
    commonNote: "one unscoped list stops both",
    lines: [
      {
        label: "newsletter",
        ours: { fate: "blocked", say: "stopped" },
        theirs: { fate: "blocked", say: "stopped" },
      },
      {
        label: "password reset",
        ours: { fate: "through", say: "delivered" },
        theirs: { fate: "blocked", say: "stopped too" },
      },
    ],
  },
  {
    title: "The sandbox doesn't lie to you",
    where: "test sends excluded from scoring",
    commonNote: "nothing left the building",
    lines: [
      {
        label: "the test send",
        ours: { fate: "through", say: "goes to a real mailbox" },
        theirs: { fate: "blocked", say: "never leaves" },
      },
      {
        label: "what it reports",
        ours: { fate: "through", say: "what the provider said" },
        theirs: { fate: "absent", say: "delivered · simulated" },
      },
    ],
  },
  {
    title: "A data request you can answer the same day",
    where: "one export call · one erase call",
    commonNote: "and the opt-out goes with the record",
    lines: [
      {
        label: "export",
        ours: { fate: "through", say: "one call" },
        theirs: { fate: "absent", say: "unspecified" },
      },
      {
        label: "erase",
        ours: { fate: "through", say: "one call" },
        theirs: { fate: "absent", say: "unspecified" },
      },
      {
        label: "the opt-out",
        ours: { fate: "through", say: "survives the erase" },
        theirs: { fate: "blocked", say: "erased with it" },
      },
    ],
  },
  {
    title: "Proof you can hand to someone else",
    where: "signed · independently verifiable · content hash included",
    commonNote: "checkable by nobody",
    lines: [
      {
        label: "what you get",
        ours: { fate: "through", say: "a signed bundle" },
        theirs: { fate: "absent", say: "a screenshot" },
      },
      {
        label: "who can check it",
        ours: { fate: "through", say: "anyone, without us" },
        theirs: { fate: "blocked", say: "nobody" },
      },
    ],
  },
];

/**
 * The glyph. Ink at three weights, and that is the entire palette of this
 * section — see the file note for why a signal colour must never appear here.
 * `through` ends in a node, `blocked` ends in a bar and is drawn short because
 * it did not get the whole way, `absent` is dashed and has no terminal at all
 * because there is nothing to terminate.
 */
function Track({ fate }: { fate: Fate }) {
  return (
    <span aria-hidden="true" className="relative flex h-4 w-8 shrink-0 items-center">
      {fate === "absent" ? (
        <span
          className="w-full border-t border-dashed"
          style={{ borderColor: "hsl(var(--line-dim))" }}
        />
      ) : fate === "through" ? (
        <>
          <span className="h-px w-full bg-ink/45" />
          <span className="absolute right-0 size-[6px] rounded-full bg-ink" />
        </>
      ) : (
        <>
          <span className="h-px w-[70%] bg-ink/25" />
          <span className="absolute left-[70%] h-3.5 w-[3px] rounded-sm bg-ink/70" />
        </>
      )}
    </span>
  );
}

function Column({
  name,
  lines,
  side,
  note,
  sourced,
}: {
  name: string;
  lines: Line[];
  side: "ours" | "theirs";
  note: string;
  /** Our column prints where the behaviour is enforced; theirs cannot. */
  sourced?: boolean;
}) {
  const ours = side === "ours";
  return (
    <div
      className={
        ours
          ? "rounded-xl bg-card p-4 shadow-e2"
          : "rounded-xl px-4 py-4"
      }
      style={{ "--background": ours ? "var(--card)" : "var(--well)" } as React.CSSProperties}
    >
      <p className={`text-[13px] ${ours ? "font-medium" : "text-ink-muted"}`}>{name}</p>

      <div className="ruled mt-3">
        {lines.map((l) => {
          const o = ours ? l.ours : l.theirs;
          return (
            <div
              key={l.label}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5 text-[13px]"
            >
              <span className="w-[6.75rem] shrink-0 text-ink-muted">{l.label}</span>
              <Track fate={o.fate} />
              <span
                className={
                  o.fate === "through"
                    ? "min-w-0 flex-1 font-medium"
                    : "min-w-0 flex-1 text-ink-muted"
                }
              >
                {o.say}
              </span>
            </div>
          );
        })}
      </div>

      <p
        className={`mt-3 text-[12.5px] text-ink-muted ${sourced ? "font-mono" : ""}`}
        data-fact={sourced ? "" : undefined}
      >
        {note}
      </p>
    </div>
  );
}

export function Promises() {
  return (
    <section className="slab settle lit">
      <div className="container grid gap-10 py-14 md:py-24 lg:grid-cols-[minmax(0,3fr)_minmax(0,8fr)] lg:gap-12">
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
                      `--background` moves with the plane so any knockout ring
                      matches the card and not the page. */}
                  <Column name="rootmail" lines={r.lines} side="ours" note={r.where} sourced />
                  {/* THEIRS — left in the tray. No fill of its own, because the
                      tray IS its ground; that is the whole visual argument. */}
                  <Column
                    name="the common default"
                    lines={r.lines}
                    side="theirs"
                    note={r.commonNote}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
