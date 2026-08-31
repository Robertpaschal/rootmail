import Link from "next/link";
import { CtaButton } from "./cta-button";
import { HeroDeck, HeroDeckIndex, HeroDeckRadios } from "./hero-deck";

/**
 * THE HERO IS THE MECHANISM RUNNING, NOT A SENTENCE ABOUT IT.
 *
 * `docs/design/04-EXPERIENCE.md` §5.1 and `05-ENGAGEMENT.md` §5.1.
 *
 * Three moves built it, and only the first is decoration:
 *
 * 1. **The artifact is a deck, not a record.** Four real cases — a receipt, a
 *    campaign, a reply and a bounce — in a pressed tray, one open at a time,
 *    with every closed row still showing its subject and its LINE. The severed
 *    one is recognisable as severed before it is opened. Data and reasoning:
 *    `hero-records.ts`. The mechanism is four radio inputs: `hero-deck.tsx`.
 *
 * 2. **The scene is pinned.** The section is 280vh and its child sticks, so
 *    ~180vh of scroll is spent advancing the deck through the four cases rather
 *    than on prose. This is the measured pattern from `05-ENGAGEMENT.md` §1.3 —
 *    a sticky child in an over-tall parent, progress mapped to state by hand.
 *    It is off below `lg` and off on short viewports, where a pin would trap the
 *    reader inside a scene taller than their screen; see `.hero-rig` in
 *    `globals.css`. The scroll driver adds nothing to the DOM (`deck-scroll.tsx`).
 *
 * 3. **One obvious action.** *"Whenever you want somebody to click on
 *    something, it should be really, really obvious… you minimize other
 *    distractions from that particular area."* `See pricing` is a plain link,
 *    not a second large button at the same weight as `Start free`.
 *
 * ── WHAT CHANGED (2026-08-31) ───────────────────────────────────────────────
 * The owner: *"if we can implement the kind of depth we did for the 'email
 * fails quietly' section in the main header section… the critique is the colour
 * distinction, the elevation of depth, the presentation of information —
 * somehow we can improve the engagement… we can improve what we do with that
 * left side so the person feels engaged taking in the information."*
 *
 * The colour-distinction half was measurable and it was a layering bug. The
 * hero was the ONE section on the page that was not a `.slab`: it painted
 * nothing, so it sat on the page ground (`--paper-lift`, 92% L) with the deck's
 * tray (`--well`, 88% L) inside it — **four points of lightness between the
 * scene and the tray inside it**, where every other section on the page runs a
 * 99% sheet against an 88% tray. The section that mattered most had the least
 * depth available to it. It is a slab now, so the hero gets the same
 * three-plane stack the ladder does: sheet → pressed tray → lifted card.
 *
 * The engagement half is `HeroDeckIndex`: the left column now carries a
 * four-row contents of the deck, marked as the scene advances. Every row is
 * fully readable at rest — the mark moves, the words never appear.
 *
 * WHAT MAY NOT CHANGE. The rendering law is enforced in
 * `packages/design/src/line.tsx`, not here — a caller cannot promote an
 * inferred station. `Opened` is hollow in a marketing hero exactly as it is in
 * production, and the `Clicked` station on the first record has no timestamp,
 * so it draws dashed. The honest gap is still the first thing a stranger sees.
 *
 * ALSO NOT HERE, and not to be restored: the `3,000 sends · 500 contacts · free
 * monthly` strip. The owner removed it on 2026-08-31.
 */
export function Hero() {
  return (
    <section id="hero-rig" className="hero-rig slab">
      <div id="hero-pin" className="hero-pin lit lit-edge">
        {/* `.deck` is the GRID, so the four radios below can reach both columns
            with a sibling combinator. They are absolutely positioned and take
            no track. Reorder these and the deck stops opening — the order is
            load bearing and `globals.css` says so at the rules themselves. */}
        <div className="deck container grid w-full gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-14 lg:py-10">
          <HeroDeckRadios />

          <div className="max-w-xl">
            {/* ONE PLAIN SENTENCE, NO METAPHOR. The owner, reading the old
                headline pair cold: *"I am in the fourth section and I still
                don't know what rootmail is about."* The old h1 — "Every email
                you send, and a record of what happened to it" — is a phrase
                about a RECORD, and a stranger does not yet know why a record
                is the interesting part. This one names the job first (send
                your company's email) and the differentiator second (and know
                what happened to it), and the lead underneath is nothing but
                nouns a person recognises. */}
            <h1 className="display-xl text-balance">
              Send your company&apos;s email, and know what happened to every one.
            </h1>

            <p className="lead mt-6 max-w-md text-ink-muted">
              Order confirmations, password resets, newsletters, and the replies people send back
              — one system, one contact list, one address of your own.
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

            <HeroDeckIndex />
          </div>

          <HeroDeck />
        </div>
      </div>
    </section>
  );
}
