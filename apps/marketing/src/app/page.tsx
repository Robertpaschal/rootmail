import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { TheBreak } from "@/components/site/break";
import { TheLine } from "@/components/site/the-line";
import { SubTenancy } from "@/components/site/subtenancy";
import { Promises } from "@/components/site/promises";
import { Features } from "@/components/site/features";
import { Pricing } from "@/components/site/pricing";
import { Faq } from "@/components/site/faq";
import { Cta } from "@/components/site/cta";
import { Footer } from "@/components/site/footer";

/**
 * The homepage, reordered per `docs/design/00-PHILOSOPHY.md` §7.
 *
 * It used to run Hero → Marquee → LayerModelSection → ProductShow → WhoItsFor →
 * LayerModel → Features → SubTenancy → Promises → Pricing → FAQ → CTA: twelve
 * sections, ten of them with identical 80px padding and a centered 30px/700
 * heading under an eyebrow badge, teaching the three-layer model twice, burying
 * the wedge at position 8 and the only section with an opinion in it at 9.
 *
 * Nine sections now, each answering exactly one question:
 *
 *  1. Hero        what is this?            — the line completing on one message
 *  2. TheBreak    why does this exist?     — name the enemy, on the inverted band
 *  3. TheLine     how does it work?        — one section replacing four
 *  4. SubTenancy  is this for me?          — the wedge, moved up five places
 *  5. Promises    can I trust you?         — moved up four; the authored section
 *  6. Features    what's in it?            — twelve cards cut to six ruled rows
 *  7. Pricing     what does it cost?
 *  8. Faq         what am I still worried about?
 *  9. Cta         what do I do now?        — no slab
 *
 * `Marquee`, `WhoItsFor`, `LayerModelSection` and `LayerModel` are gone. The
 * marquee was fourteen nouns scrolling past, which is breadth-signalling; the
 * personas section existed to tell readers they were the audience, and a reader
 * who needs to be told that is not the audience.
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
        <TheBreak />
        <TheLine />
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
