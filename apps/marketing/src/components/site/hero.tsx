import Link from "next/link";
import { CtaButton } from "./cta-button";
import { HeroDeck } from "./hero-deck";

/**
 * THE HERO IS THE MECHANISM RUNNING, NOT A SENTENCE ABOUT IT.
 *
 * `docs/design/04-EXPERIENCE.md` §5.1 and `05-ENGAGEMENT.md` §5.1.
 *
 * WHAT CHANGED (2026-08-31), and why, in the owner's words: *"we can give depth
 * to that 'Your booking is confirmed' example. You can be showing different
 * things in different cases that are possible with rootmail… this is the main
 * place that people would see most times."* And: *"after the first two seconds,
 * humans tend to be less engaged, so you need a way to drive them to keep
 * scrolling down."*
 *
 * Three moves answer that, and only the first is decoration:
 *
 * 1. **The artifact is a deck, not a record.** Four real cases — a receipt, a
 *    campaign, a reply and a bounce — in a pressed tray, one open at a time,
 *    with every closed row still showing its subject and its LINE. The severed
 *    one is recognisable as severed before it is opened. Data and reasoning:
 *    `hero-records.ts`. The mechanism is four radio inputs: `hero-deck.tsx`.
 *
 * 2. **The scene is pinned.** The section is 230vh and its child sticks, so
 *    ~130vh of scroll is spent advancing the deck through the four cases rather
 *    than on prose. This is the measured pattern from `05-ENGAGEMENT.md` §1.3 —
 *    a sticky child in an over-tall parent, progress mapped to state by hand.
 *    It is off below `lg` and off on short viewports, where a pin would trap the
 *    reader inside a scene taller than their screen; see `.hero-rig` in
 *    `globals.css`. The scroll driver adds nothing to the DOM (`deck-scroll.tsx`).
 *
 * 3. **One obvious action.** *"Whenever you want somebody to click on
 *    something, it should be really, really obvious… you minimize other
 *    distractions from that particular area."* `See pricing` was a second
 *    large outline button competing with `Start free` at the same weight; it is
 *    a plain link now. The copy column is 43 words, down from 91.
 *
 * WHAT MAY NOT CHANGE. The rendering law is enforced in
 * `packages/design/src/line.tsx`, not here — a caller cannot promote an
 * inferred station. `Opened` is hollow in a marketing hero exactly as it is in
 * production, and the `Clicked` station on the first record has no timestamp,
 * so it draws dashed. The honest gap is still the first thing a stranger sees.
 */
export function Hero() {
  return (
    <section id="hero-rig" className="hero-rig border-b border-rule">
      <div id="hero-pin" className="hero-pin lit">
        <div className="container grid w-full gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-14 lg:py-10">
          <div className="max-w-xl">
            <h1 className="display-xl text-balance">
              Every email you send, and a record of what happened to it.
            </h1>

            <p className="lead mt-6 max-w-md text-ink-muted">
              Receipts, campaigns and the replies that come back — one system, one contact list, one
              reputation.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
              <CtaButton label="Start free" size="lg" arrow />
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center text-[15px] font-medium text-ink-muted underline-offset-4 transition-colors duration-interaction ease-interaction hover:text-foreground hover:underline"
              >
                See pricing
              </Link>
            </div>

            <p className="mt-6 font-mono text-[13px] text-ink-muted" data-fact>
              3,000 sends · 500 contacts · free monthly
            </p>
          </div>

          <HeroDeck />
        </div>
      </div>
    </section>
  );
}
