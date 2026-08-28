import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { getPublicChangelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What's new in rootmail — new capabilities, improvements, and fixes for senders and developers, dated and categorized.",
};

/**
 * `/changelog` — two shapes, because the page is two things: a claim about a
 * record, and the record.
 *
 *  L1  bare page ground, type-led, with the count of the thing below it stated
 *      as a fact rather than implied by scrolling
 *  L2  A SPINE. One continuous vertical rule with a witnessed node per release,
 *      the date hung in a mono rail beside it, and a year marker that cuts the
 *      spine when the calendar turns.
 *
 * WHY A SPINE AND NOT A LIST OF CARDS. A changelog is the one page on this site
 * whose content is literally the product's own subject — an append-only record
 * of things that happened, in order. The line is rootmail's device for exactly
 * that, so drawing it here is not decoration; it is the page agreeing with the
 * rest of the product. Every node is `witnessed` (solid, filled) because every
 * entry is something we did and can point at, which is the only state that
 * would be honest.
 *
 * WHAT THIS REPLACES: a `<Badge>` eyebrow over a centred-ish heading, then a
 * two-column grid where the left column was a date and the right column was a
 * bullet list of `<Badge>` chips — the same three coloured pills repeating down
 * 30 entries, which turns the kind of a change into wallpaper.
 *
 * The kind marker is mono text now, not a pill: "New" reads as a word at 11px
 * and takes NO colour — the three signal colours mean what happened to a
 * message (`00-PHILOSOPHY.md` §10.2) and a release is not a message. The only
 * coloured thing left on the page is the node on the spine, and it is
 * `witnessed` because the line's own definition of that state is "a provider
 * confirmed it, or WE DID IT".
 */

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ChangelogPage() {
  const entries = await getPublicChangelog();
  const changeCount = entries.reduce((n, e) => n + e.changes.length, 0);
  const latest = entries[0]?.date;

  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── L1 · bare ground, type-led ─────────────────────────────────── */}
        <section className="container py-14 md:py-20">
          <div className="max-w-3xl">
            <h1 className="display-xl text-balance">Everything we have shipped, dated.</h1>
            <p className="mt-6 font-mono text-[11px] text-ink-muted" data-fact>
              {entries.length} releases · {changeCount} changes · newest first
              {latest ? ` · last ${formatDate(latest)}` : ""}
            </p>
          </div>
        </section>

        {/* ── L2 · the spine ─────────────────────────────────────────────── */}
        <section className="slab settle">
          <div className="container py-12 md:py-16">
            <ol className="relative">
              {entries.map((entry, i) => {
                const year = entry.date.slice(0, 4);
                const prevYear = i > 0 ? entries[i - 1].date.slice(0, 4) : null;
                const newYear = year !== prevYear;
                return (
                  <li key={`${entry.date}-${i}`}>
                    {/* The year cuts the spine. A marker that only appears when
                        the calendar turns is a real structural event; one that
                        appears on every row is a border. */}
                    {newYear ? (
                      <p
                        className={`pb-6 font-mono text-[11px] uppercase tracking-wide text-ink-muted ${
                          i === 0 ? "" : "border-t border-rule pt-6"
                        }`}
                        data-fact
                      >
                        {year}
                      </p>
                    ) : null}

                    <article className="grid gap-x-8 gap-y-3 md:grid-cols-[9rem_1fr]">
                      <div className="md:pt-0.5">
                        <time
                          dateTime={entry.date}
                          className="font-mono text-[11px] text-ink-muted"
                          data-fact
                        >
                          {formatDate(entry.date)}
                        </time>
                      </div>

                      {/* The spine itself: a 1px rule down the left of the
                          content column, with one filled node on it. Both are
                          static CSS — nothing here needs a frame to exist. */}
                      <div className="relative border-l border-rule pb-10 pl-6">
                        <span
                          aria-hidden="true"
                          className="absolute -left-[3.5px] top-[0.45rem] size-[7px] rounded-full bg-witnessed"
                        />
                        <h2 className="display-s">{entry.title}</h2>
                        <ul className="ruled mt-3 border-t border-rule">
                          {entry.changes.map((c, j) => (
                            <li
                              key={j}
                              className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[4.5rem_1fr]"
                            >
                              <span
                                className="font-mono text-[11px] uppercase tracking-wide text-ink-muted"
                                data-fact
                              >
                                {c.kind}
                              </span>
                              <span className="text-[0.9375rem] leading-relaxed text-ink-muted">
                                {c.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
