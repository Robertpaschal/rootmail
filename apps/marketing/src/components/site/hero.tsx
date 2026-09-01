import Link from "next/link";
import { CtaButton } from "./cta-button";
import { HeroDeck, HeroDeckIndex, HeroDeckRadios } from "./hero-deck";
import { HERO_RECORDS } from "./hero-records";

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
 * 2. **The scene is pinned.** The section is 250vh and its child sticks, so
 *    ~150vh of scroll is spent advancing the deck through the four cases rather
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
 * ── WHAT CHANGED (2026-09-01) ───────────────────────────────────────────────
 * Two things, and they are separate asks that landed together.
 *
 * **1. The tray is a vertical deck.** *"in the main header … we can now use
 * that vertical version of it to really, really make it stand out and not be
 * so flat."* The mechanic is `.deck-col` in `globals.css` and the DOM did not
 * change to get it — see `hero-deck.tsx`. The constraint this section has and
 * the two below it do not: **it is the first thing anyone sees.** So the front
 * record is complete, square-on and readable at `--deck-p: 0`, nothing plays
 * by itself, and the deck's whole job is to make scrolling rewarding rather
 * than to gate comprehension. The second card showing below the first is the
 * one piece of it that does work at rest: it is the cue that there is more.
 *
 * **2. The section below it went dark, and this one did not.** *"you can
 * alternate the colours between those two first sections so it's not both on
 * brown backgrounds when we have yellow too and adjacent colours."* Hero and
 * TheLine were paper and linen — different tokens, and measured **1.17:1**
 * apart in dark and **1.16:1** in light. A hex check calls that two grounds;
 * an eye calls it one, and the owner is the eye.
 *
 * THE YELLOW WAS TRIED HERE FIRST and it is measurably wrong. On brass this
 * hero is 1.86:1 against the linen below it in DARK — fixed — and **1.16:1 in
 * LIGHT**, because brass and linen differ by hue and barely by lightness on a
 * light page (`globals.css` says so at the token: "1.15:1 against linen"). It
 * would have moved the complaint from one theme to the other. Brass on the
 * SECOND section is not available either: `who-its-for` is brass, and two
 * brass bands in a row is the same bug with a louder pigment.
 *
 * So the fix is one class on `the-line`, not on this file: it is `ground-ink`
 * now, the seam is ~16:1 in both themes, and this section keeps the default
 * sheet — which is also what keeps `Start free` a brass control on a neutral
 * ground rather than an ink pill on gold. Brass still appears exactly once.
 *
 * ALSO NOT HERE, and not to be restored: the `3,000 sends · 500 contacts · free
 * monthly` strip. The owner removed it on 2026-08-31.
 *
 * ── WHAT CHANGED (2026-09-01, later the same day) ───────────────────────────
 * Three defects the owner found in the deck above, and the numbers that closed
 * them. Read `hero-deck.tsx` and `globals.css` for the mechanics; this is the
 * index.
 *
 * **1. The disclosure spilled out of the card.** *"It seems shorter when I
 * click the 'why is it hollow' button. The text spurs out of the box … It
 * happens for all of them."* It did: the card had a FIXED height and the
 * record needed 46–67px more with its `<details>` open. The deck is sized to
 * its tallest card now and `--deck-h` is a floor rather than a ceiling.
 *
 * **2. The records were the section's own colour.** *"Both of them are white
 * … there's no difference between the brown for this and the brown for
 * that."* Measured 1.00:1 — a plain `.slab` paints itself `--card` and the
 * records were `bg-card`. They are `--plate` now: **1.40:1 in light, 1.32:1 in
 * dark**, up from 1.00, and the old `bg-well` tray behind them was only 1.17.
 *
 * **3. There is no box around the deck.** *"I don't know why you are putting a
 * box around it … just that 'Who is it for?' section, but vertically made."*
 * The tray is gone; the records are the objects on the section ground, which
 * is exactly `who-its-for`'s shape. So the paragraph above about a
 * "sheet → pressed tray → lifted card" stack is HISTORY: there are two planes
 * here now, the sheet and the record, and the tray is not coming back.
 *
 * The deck is also top-aligned with the headline rather than centred — see the
 * comment on the grid below.
 */
export function Hero() {
  return (
    <section
      id="hero-rig"
      className="hero-rig deck-rig slab"
      data-run="down"
      style={
        {
          "--deck-steps": HERO_RECORDS.length - 1,
          /* THE FLOOR, not the ceiling (2026-09-01). `--deck-h` used to be a
             fixed card height, and a record whose `why hollow?` disclosure was
             open needed 531px in a 464px box — which is exactly the text the
             owner watched spill out of the card. It is now a `min-height`, and
             the stage's row is sized to the TALLEST card, so nothing can
             overflow whatever it is set to.

             34rem = 544px is the measured worst case (record 1, campaign, with
             its explanation open: 531px at 1280 and 539px at 1024) plus a
             little air. Setting it above the worst case is what keeps the deck
             from resizing under the reader's thumb when a disclosure opens;
             getting it wrong now costs a few pixels of empty card rather than
             a paragraph hanging off the edge. */
          "--deck-h": "34rem",
        } as React.CSSProperties
      }
    >
      <div id="hero-pin" className="hero-pin lit lit-edge">
        {/* `.deck` is the GRID, so the four radios below can reach both columns
            with a sibling combinator. They are absolutely positioned and take
            no track. Reorder these and the deck stops opening — the order is
            load bearing and `globals.css` says so at the rules themselves. */}
        {/* `lg:items-start`, not `lg:items-center` (2026-09-01). The owner:
            *"the deck now sits lower than it should."* It did — centring a
            deck shorter than the copy column pushed its top 72px below the
            headline, so the two halves of the hero started at different
            heights for no reason a reader could see. Aligned to the top they
            begin on the same line, which is also what lets the deck be taller
            without pushing its own bottom off a short window. */}
        <div className="deck container grid w-full gap-10 py-12 md:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14 lg:py-10">
          <HeroDeckRadios />

          {/* `min-w-0` on both columns (2026-09-01). A grid item's automatic
              minimum size is its MIN-CONTENT, and the record's line drawing is
              a 276px SVG: below `lg` the single column was sized to 356px
              inside a 301px content box, so the copy and the deck were both
              cut off at the slab's `overflow: clip` edge at 375. Measured
              before: 65 elements past the viewport, the copy column ending at
              401px on a 375px screen. After: none. (`.deck-shell` carries the
              same `min-w-0` in `hero-deck.tsx`.) */}
          <div className="min-w-0 max-w-xl">
            {/* ONE PLAIN SENTENCE, NO METAPHOR. The owner, reading the old
                headline pair cold: *"I am in the fourth section and I still
                don't know what rootmail is about."* The old h1 — "Every email
                you send, and a record of what happened to it" — is a phrase
                about a RECORD, and a stranger does not yet know why a record
                is the interesting part. This one names the job first (send
                your business's email) and the differentiator second (and know
                what happened to it), and the lead underneath is nothing but
                nouns a person recognises.

                BUSINESS, NOT COMPANY (owner, 2026-09-01): *"'Company' kind of
                makes it seem higher than 'business', even though by definition
                they're not really that different. People tend to say 'business'
                more than they would say 'company'."* Worth honouring past this
                one line, because it is the same audience call the whole page
                turns on — the deck below this fold opens with a school office,
                a five-a-side league and a one-person consultancy, none of whom
                would describe themselves as having a company. Changed in the
                metadata title and the social card too, so the sentence a
                stranger meets in a search result or a pasted link is the one on
                the page. */}
            <h1 className="display-xl text-balance">
              Send your business&apos;s email, and know what happened to every one.
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
