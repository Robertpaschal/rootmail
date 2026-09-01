"use client";

import { useState } from "react";

/**
 * `<SpecimenRecord>` — `docs/design/04-EXPERIENCE.md` §5.6.
 *
 * The inverse of a feature grid. A grid of twelve equal cards *means* breadth;
 * you cannot restyle your way from that meaning to "there is one record and it
 * answers everything". So the section is one record, rendered whole — the
 * object, not a picture of it — with six questions pointing into it.
 *
 * The mono line under each question is the section. A feature grid says "we do
 * deliverability"; this says **the answer lives in this column of this row, and
 * here is the row**. Those column names are the six `fact` lines that used to
 * sit under six 40-word bodies, except a column name is a stronger fact than a
 * paraphrase of one, so the bodies went and the columns stayed.
 *
 * THE THREE LAWS
 * 1. The record renders at FULL ink with nothing highlighted, and all six rows
 *    are readable, before anything is pointed at. Hover is pure addition. A
 *    record that starts dimmed is content made visible by interaction, which is
 *    Law 1 with a mouse instead of a frame — so it never starts dimmed, and the
 *    six source columns are printed at rest rather than revealed on hover.
 * 2. The highlight is a border weight and a colour, with no transition and no
 *    movement. This artifact is already fully reduced-motion compatible; there
 *    is no branch for it because there is nothing to skip.
 * 3. `opened` carries `inferred` in the record and `clicked` is an em dash,
 *    here exactly as in the hero and exactly as in production.
 */

type Field = { k: string; v: string; q: number; tone?: string };

/** One message, whole. `q` is the question each field answers. */
const record: Field[] = [
  { k: "id", v: "msg_01J9Q7F2XKB4M0RVTC8H", q: 0 },
  { k: "to", v: "ana@sunsetvillas.com", q: 2 },
  { k: "sent", v: "09:14:03", q: 0 },
  { k: "delivered", v: "09:14:07", q: 0 },
  { k: "opened", v: "09:41:55 · inferred", q: 0 },
  { k: "clicked", v: "—", q: 0 },
  { k: "client", v: "sunsetvillas.com", q: 1 },
  { k: "score", v: "92 · 7d", q: 1 },
  { k: "complaints", v: "0.02% · 7d", q: 1 },
  { k: "suppressed", v: "no · marketing scope", q: 2 },
  { k: "domain", v: "DKIM, SPF, DMARC · 09:02", q: 3 },
  { k: "thread", v: "thr_01J9QB4K2MP7 · 2 entries", q: 4 },
  { k: "content hash", v: "sha256:9f2c41ab…7d0e", q: 5 },
  { k: "signature", v: "ed25519:4b81…c2af", q: 5 },
];

const questions = [
  { of: "Every message", body: "what happened to it, and where it stopped", src: "messages.delivered_at" },
  { of: "Every sender", body: "how a client's numbers are moving", src: "tenant_scores.complaint_rate_7d" },
  { of: "Every opt-out", body: "who we will not mail, and why", src: "suppressions.scope" },
  { of: "Every domain", body: "whether the records still resolve", src: "domains.last_checked_at" },
  { of: "Every reply", body: "what came back, and what it stopped", src: "threads.entries" },
  { of: "Every claim", body: "what a third party can check", src: "proof.content_sha256" },
];

export function Features() {
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? pinned;

  return (
    <section id="features" className="slab settle ground-ink lit-edge">
      <div className="container py-14 md:py-24">
        <div className="max-w-2xl">
          <h2 className="display-m text-balance">
            Three weeks later, somebody asks what happened to one email.
          </h2>
          <p className="lead mt-5 text-ink-muted">
            Every answer comes out of one record. Point at a question and the part of the record
            that answers it is marked — and under each question is the exact field we read it
            from, so you can check us.
          </p>
          {/* THE DIFFERENTIATOR, IN PLAIN ENGLISH, AT THE POINT IT IS EARNED.
              The rendering law is the strongest thing we have and it spent the
              last pass being the FIRST thing on the page, where it read as
              philosophy instead of as a promise. It belongs here, after a
              stranger knows what the product is and has seen the drawing three
              times, said in words rather than implied by a stroke weight. */}
          <p className="mt-6 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-muted">
            And where we do not know, the record says so. An &ldquo;open&rdquo; is a tiny image
            loading, and roughly a third of the time it is a mail app fetching pictures with
            nobody in the room — so we draw an open hollow and a confirmed delivery solid,
            everywhere, for ever. You will not find a chart here that quietly turns a guess into
            a fact. It costs us a tick in a comparison table, and it is the reason the rest of
            the numbers on this page are worth reading.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="ruled border-y border-rule">
            {questions.map((q, i) => (
              <button
                key={q.of}
                type="button"
                aria-pressed={pinned === i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                onClick={() => setPinned((p) => (p === i ? null : i))}
                className={`block w-full border-l-2 py-4 pl-3 text-left ${
                  active === i ? "border-l-ink" : "border-l-transparent"
                }`}
              >
                <span className="display-s">{q.of}</span>
                <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-muted">
                  {q.body}
                </span>
                <span className="mt-1.5 block font-mono text-[12.5px] text-ink-muted" data-fact>
                  {q.src}
                </span>
              </button>
            ))}
          </div>

          <figure className="rounded-lg bg-well shadow-well">
            <figcaption className="border-b border-rule px-4 py-3 font-mono text-[12.5px] text-ink-muted" data-fact>
              one message · demonstration
            </figcaption>
            <div className="ruled px-4 py-1">
              {record.map((f) => {
                const on = active !== null && f.q === active;
                const off = active !== null && f.q !== active;
                return (
                  <div
                    key={f.k}
                    className={`flex flex-wrap items-baseline gap-x-4 border-l-2 py-1.5 pl-3 ${
                      on ? "border-l-ink" : "border-l-transparent"
                    }`}
                  >
                    <span
                      className={`w-28 shrink-0 text-[12.5px] ${off ? "text-ink-muted/50" : "text-ink-muted"}`}
                    >
                      {f.k}
                    </span>
                    <span
                      className={`font-mono text-[12px] ${off ? "text-ink-muted/50" : ""}`}
                      data-fact
                    >
                      {f.v}
                    </span>
                  </div>
                );
              })}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
