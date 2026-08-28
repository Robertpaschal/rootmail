# docs/design

The redesign of rootmail, started 2026-08-26 from one piece of feedback: the
product "feels too blank — there's no design philosophy or narrative that makes
the product have an opinion."

Read in this order.

| File | What it is |
|---|---|
| `00-PHILOSOPHY.md` | **The constitution.** The thesis, the spine ("the line"), voice, signature moves, refusals, and the narrative arcs. §9 records every amendment made after the evidence came in. If a design decision contradicts this file, the file wins or the file changes — not quietly, and not both. |
| `01-REFERENCES.md` | Forensic teardown of five authored products, measured from live computed CSS rather than described. Ends with what to steal, ranked, and what must not be imported. |
| `02-AUDIT.md` | The diagnosis it was all written against: what was wrong, measured. |

The implementation lives in **`packages/design`** (tokens, Tailwind preset, and
the `<Line>` / `<Metric>` / `<Fact>` components). `CLAUDE.md` has the working
notes and the gotchas.

## The short version

Email is a chain of custody, not a broadcast. The enemy is the black box and its
aesthetic — the naked open-rate number, the aggregate with no window and no
method. So: **saturated colour is reserved for state**, and the line never runs
solid through something we did not observe.

That single rule is why an `opened` station renders hollow forever, why every
number ships with its window and its method, and why capability we have not
built is drawn as a dashed continuation rather than hidden. Honesty is not a
constraint on this design. It is the design.
