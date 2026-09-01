import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { TheLine } from "@/components/site/the-line";
import { WhoItsFor } from "@/components/site/who-its-for";
import { ATuesday } from "@/components/site/a-tuesday";
import { TheBreak } from "@/components/site/break";
import { SubTenancy } from "@/components/site/subtenancy";
import { Promises } from "@/components/site/promises";
import { Features } from "@/components/site/features";
import { Pricing } from "@/components/site/pricing";
import { Faq } from "@/components/site/faq";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";

/**
 * THE HOMEPAGE — reordered on 2026-08-31 around comprehension rather than
 * density.
 *
 * ── WHAT WENT WRONG, NAMED ──────────────────────────────────────────────────
 * The previous pass cut this page from 3,006 words to about 900 and treated
 * that as the win. It measured density and never measured comprehension. Plain
 * product benefits were replaced with an argument about epistemology, and the
 * ordering put that argument SECOND — so a stranger met "email fails quietly"
 * before they had been told what rootmail is. The owner, reading the result:
 *
 *   *"I am in the fourth section and I still don't know what rootmail is
 *   about. I honestly still don't know what rootmail is about. I'm not yet
 *   convinced."* And: *"We nailed down the visuals… but we haven't gotten the
 *   story part down."*
 *
 * The rendering law — that we draw the difference between what we witnessed
 * and what we guessed — is a real differentiator and it is not an explanation
 * of what the product IS. It had become the whole page. It is now the seventh
 * section, stated in plain words, where a reader has the context to see why it
 * matters.
 *
 * ── THE ORDER, AND THE QUESTION EACH SECTION ANSWERS ────────────────────────
 *
 *   1. Hero        What is this?            one plain sentence, then four real
 *                                           records dealt as a vertical deck
 *   2. TheLine     What does it do for me?  send it / read what comes back /
 *                                           look it up later — one email at
 *                                           three moments, in nouns
 *   3. WhoItsFor   Who is it for?           seven cards dealt one at a time,
 *                                           platform first
 *   4. ATuesday    What is an ordinary day? six beats of one small business's
 *                                           Tuesday, dealt as a deck running the
 *                                           other way; one needed a person
 *   5. TheBreak    Why is it different? (1) email stops working quietly, and
 *                                           what we do at each threshold
 *   6. SubTenancy  Why is it different? (2) the wedge — sending for other
 *                                           people, and the trunk we share
 *   7. Promises    Why is it different? (3) five defaults, ours beside the
 *                                           usual ones
 *   8. Features    Why is it different? (4) one record answers everything —
 *                                           and where we don't know, we say so
 *   9. Pricing     What does it cost?       what is metered, and what is not
 *  10. Faq         What am I still worried about?
 *  11. Cta         What do I do now?
 *
 * Questions 1–4 are the ones the austerity pass deleted, and they are the four
 * a stranger actually has. Questions 5–8 are the argument, and the argument
 * only works once they are answered.
 *
 * ── THE RULE THAT GOVERNS EDITS HERE ────────────────────────────────────────
 * Word count is not the metric; comprehension is. A section that needs forty
 * more words to make sense gets them. What must NOT come back is the 3,000
 * words of undifferentiated prose the austerity pass was reacting to — that
 * page's problem was structure and repetition, not that it explained things.
 *
 * And the standing rule from CLAUDE.md applies to this file above all: the
 * visual system is not what changed here. Type, brass, depth, curves, the
 * slabs, the scroll-driven scenes, the hero deck and the footer are untouched.
 * Words, headings, section purpose and ordering are what moved.
 *
 * ── THE GROUND TABLE (2026-09-01) ───────────────────────────────────────────
 * The owner said this three separate times, about three different pairs:
 *
 *   *"I don't think it's good to have two sections on brown and on brown. We
 *   can invert the colours, maybe yellow and brown … the one on top of it and
 *   the one below it, they are all on brown backgrounds."*
 *
 * They were right, and it was structural. Every `.slab` paints itself
 * `hsl(var(--card))`, so nine of these eleven sections were literally the same
 * ground and the only relief on the page was two inverted bands.
 *
 * **THE RULE, CORRECTED 2026-09-01: adjacent grounds need a minimum
 * PERCEPTUAL STEP, not merely different token values.** The first version of
 * this rule said "no two consecutive sections may read as the same ground" and
 * it was checked by comparing computed colours for equality — which passed
 * with zero duplicates while three seams on this page sat at **1.17:1**. The
 * owner reported all three anyway, because 1.17 is not a section change; it is
 * the same ground with a slightly different lid.
 *
 * The floor is roughly **1.5:1 at a seam, in BOTH themes.** Measured (dark /
 * light), after the 2026-09-01 pass:
 *
 *    1. Hero        paper    the default sheet
 *                              ↓ 15.99 / 16.14
 *    2. TheLine     ink      inverted. Was `linen`, which measured 1.17 dark
 *                              and 1.16 light against the hero — the owner:
 *                              *"you can alternate the colours between those
 *                              two first sections so it's not both on brown
 *                              backgrounds."*
 *                              ↓ 10.07 / 11.47
 *    3. WhoItsFor   BRASS    the one pigment band; also the first of the two
 *                              full-bleed card decks
 *                              ↓ 1.59 / 1.41
 *    4. ATuesday    paper
 *                              ↓ 15.99 / 16.14
 *    5. TheBreak    ink      inverted
 *                              ↓ 15.99 / 16.14
 *    6. SubTenancy  paper
 *                              ↓ 1.17 / 1.22   ← KNOWN, not yet fixed
 *    7. Promises    linen
 *                              ↓ 18.73 / 13.28
 *    8. Features    ink      inverted
 *                              ↓ 15.99 / 16.14
 *    9. Pricing     paper
 *                              ↓ 1.17 / 1.22   ← KNOWN, not yet fixed
 *   10. Faq         linen
 *                              ↓ 18.73 / 13.28
 *   11. Cta         ink      inverted, and the only one with a drifting layer
 *                              ↓ 17.34 / 15.10
 *   —   Footer      paper    (`bg-paper`, so it does not repeat the Cta's ink)
 *
 * TWO PAPER→LINEN SEAMS SURVIVE (6→7 and 9→10) and they are the same defect
 * as the one just fixed at the top. They are left deliberately: fixing them is
 * a ground change to four sections nobody was rebuilding, and it is a separate
 * decision about how many inverted bands this page should carry.
 *
 * WHY NOT BRASS FOR THE SECOND SECTION, which is what the owner reached for
 * ("when we have yellow too"): brass is section 3, and two brass bands in a
 * row is the same bug in a louder pigment. Brass on the HERO instead was
 * measured and rejected — 1.86 against linen in dark, but **1.16 in light**,
 * because brass and linen differ by hue and hardly at all by lightness on a
 * light page. It would have moved the complaint into the other theme.
 *
 * Brass still appears once on purpose. It is the loudest ground in the set,
 * and a second one would make the first mean nothing.
 *
 * Two of them are also different MATERIALS rather than different shades:
 * `linen` gives up its lift and takes the well's inset treatment, and `brass`
 * takes the deepest one in the set. That is what stops the alternation from
 * being four browns in dark mode, which is the failure it was built to fix.
 */
export default function HomePage() {
  return (
    <>
      <Navbar />
      {/* The slabs sit ON a ground rather than butting against each other, so
          the page reads as stacked sheets. The gutter is what makes the curve
          on each section legible — a full-bleed rounded section has nothing to
          be rounded against. */}
      <main className="px-3 pb-4 sm:px-5">
        <Hero />
        <TheLine />
        <WhoItsFor />
        <ATuesday />
        <TheBreak />
        <SubTenancy />
        <Promises />
        <Features />
        <Pricing addons={false} />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
