"use client";

import { useState } from "react";
import { Line, type Station } from "@rootmail/design";

/**
 * `<DefaultDiff>` — `docs/design/04-EXPERIENCE.md` §5.5.
 *
 * Five defaults this product chose against the industry's, on purpose. They used
 * to be five 45-word paragraphs: 225 words of us asserting that our choice was
 * better. A paragraph cannot show you a password reset arriving after somebody
 * unsubscribed from a newsletter. A drawing can, and the drawing is the same
 * primitive the rest of the page uses, which is what makes five small toys read
 * as one system rather than five widgets.
 *
 * **Flipping a row changes the DRAWING, not the prose.** The `where` line under
 * each row — the sourcing line `00-PHILOSOPHY.md §5.3` requires — does not move,
 * because it is true of our side either way.
 *
 * HONESTY GUARD (the part that decides whether a row may ship). `the common
 * default` names nobody, and every row must be a STRUCTURAL fact about a
 * mechanism rather than a strawman about a company: what a single unscoped
 * suppression list does to a transactional message; what a *simulated* sandbox
 * is able to report about a message that never left; what a screenshot proves.
 * If a row cannot be stated that way, the row does not ship.
 *
 * THE THREE LAWS
 * 1. Resting state is all five at `here`, drawn complete, every `where` line
 *    present. `the common default` is entirely opt-in, so with no script — or a
 *    frozen frame — the section is complete and nothing on it disparages
 *    anybody. Nothing is revealed by motion because nothing moves.
 * 2. `prefers-reduced-motion` needs no branch: the switches have no transition
 *    at any setting, and the drawing simply differs.
 * 3. Row 3 is the rendering law turned on the category's founding lie: a
 *    sandbox reporting a solid `Delivered` for a message that never left. We
 *    draw it under the same law we draw our own.
 */

type Row = {
  title: string;
  /** The `where` line: sourcing, and true of our side regardless of the switch. */
  where: string;
  here: Station[][];
  common: Station[][];
  /** Only shown on the flipped side, where the drawing needs a word. */
  commonNote?: string;
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

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Show the common default instead of rootmail's"
      onClick={onToggle}
      className="inline-flex min-h-11 shrink-0 items-center gap-px rounded-lg border border-rule font-mono text-[11px]"
    >
      <span className={`px-2 py-1.5 ${on ? "bg-ink text-background" : "text-ink-muted"}`}>
        default
      </span>
      <span className={`px-2 py-1.5 ${on ? "text-ink-muted" : "bg-ink text-background"}`}>
        here
      </span>
    </button>
  );
}

export function Promises() {
  const [flipped, setFlipped] = useState<boolean[]>(() => rows.map(() => false));
  const allFlipped = flipped.every(Boolean);

  return (
    <section className="slab settle lit">
      <div className="container grid gap-10 py-14 md:py-24 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <div className="lg:sticky lg:top-28">
            <h2 className="display-l text-balance">What happens if you change nothing</h2>
            <p className="lead mt-5 text-ink-muted">
              Five defaults, set the way we would want them set for our own mail. Flip a row to see what most tools do instead.
            </p>
            {/* One press turns the whole section dotted and severed. It is the
                single most screenshot-prone frame on the page — which is why it
                is opt-in and why the resting state is the opposite of it. */}
            <button
              type="button"
              onClick={() => setFlipped(rows.map(() => !allFlipped))}
              className="mt-5 inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-4"
            >
              {allFlipped ? "Put them back" : "Show me all five"}
            </button>
          </div>
        </div>

        <div className="ruled border-t border-rule">
          {rows.map((r, i) => {
            const on = flipped[i];
            const drawings = on ? r.common : r.here;
            return (
              <div key={r.title} className="py-7">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <h3 className="display-s max-w-md text-balance">{r.title}</h3>
                  <Switch
                    on={on}
                    onToggle={() =>
                      setFlipped((f) => f.map((v, j) => (j === i ? !v : v)))
                    }
                  />
                </div>

                <div className="mt-5 flex flex-wrap items-start gap-x-10 gap-y-4 overflow-x-auto pb-1">
                  {drawings.map((d, j) => (
                    <Line key={j} stations={d} scale="page" />
                  ))}
                </div>

                {on && r.commonNote ? (
                  <p className="mt-2 font-mono text-[11px] text-stopped" data-fact>
                    {r.commonNote}
                  </p>
                ) : null}

                <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
                  {r.where}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
