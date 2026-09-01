import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * The close — `docs/design/04-EXPERIENCE.md` §5.9 and §7.4, handoff 9.
 *
 * Eight sections have shown the visitor a record of somebody else's message.
 * The close is the only one that asks them for something of their own, so it is
 * the only ask on the page that is not "make an account": it points at
 * `/check`, which looks up what public DNS actually publishes about a domain
 * they name and draws the answer under the same rendering law as everything
 * above it — solid where it verified, dotted where it could not.
 *
 * That is why the primary button is not "Start free". A stranger who has just
 * watched us decline to claim an open does not want a signup form; they want to
 * see the drawing pointed at themselves. The account link stays, second.
 *
 * WHAT LEFT THIS FILE, so nobody puts it back:
 *  - the 34-word "Make an account, send one message to yourself…" paragraph;
 *  - the four-station `<Line>` above the heading — the ninth line on the page
 *    and the only one carrying no data. The checker draws real ones.
 *
 * It is `py-32` where every other section is `py-24`: the one argued exception
 * in §7.2, so the close reads as arrival rather than as a tenth station.
 *
 * ── THE DRIFTING LAYER (2026-09-01) ─────────────────────────────────────────
 * The owner: *"this second-to-last section is good, it's not boring, but the
 * background — we can do a job with images floating behind it, maybe in a
 * translucent glassmorphism kind of way, because it is a CTA-heavy section.
 * Images floating behind the text, from left to right or up and down."*
 *
 * There are no images, because we have none and will not invent any. The stage
 * below is a colour wash with six frosted panes drifting over it at three
 * different rates, and **every pane is empty**. That is deliberate and it is
 * the constraint that keeps this legal: a pane containing a DNS row or a
 * message id would be information rendered at 6% opacity behind a 22px blur,
 * which is information we have hidden. There is nothing in there to hide.
 *
 * The whole stage is one `aria-hidden` div outside the reading order, it is
 * `pointer-events: none`, and its worst case — no scroll-driven animation
 * support — is a still background. The words, the figures and both controls
 * are in the layer above it and do not know it exists.
 */
export function Cta() {
  return (
    <section id="cta" className="slab settle ground-ink lit-edge">
      {/* Decoration, and nothing but. See the note above. */}
      <div aria-hidden="true" className="cta-stage">
        <div className="cta-wash" />
        <div className="cta-glass cta-p1">
          <div className="cta-mark" style={{ width: "62%" }} />
          <div className="cta-mark" style={{ width: "38%" }} />
          <div className="cta-mark-dim" style={{ width: "80%" }} />
        </div>
        <div className="cta-glass cta-p2">
          <div className="cta-node" />
          <div className="cta-mark" style={{ width: "74%" }} />
          <div className="cta-mark" style={{ width: "52%" }} />
          <div className="cta-mark-dim" style={{ width: "66%" }} />
          <div className="cta-mark" style={{ width: "44%" }} />
        </div>
        <div className="cta-glass cta-p3">
          <div className="cta-mark" style={{ width: "48%" }} />
          <div className="cta-mark-dim" style={{ width: "72%" }} />
        </div>
        <div className="cta-glass cta-p4">
          <div className="cta-mark" style={{ width: "70%" }} />
          <div className="cta-mark" style={{ width: "40%" }} />
        </div>
        <div className="cta-glass cta-p5">
          <div className="cta-mark" style={{ width: "56%" }} />
          <div className="cta-mark-dim" style={{ width: "84%" }} />
          <div className="cta-node" />
          <div className="cta-mark" style={{ width: "36%" }} />
        </div>
        <div className="cta-glass cta-p6">
          <div className="cta-mark-dim" style={{ width: "78%" }} />
          <div className="cta-mark" style={{ width: "46%" }} />
        </div>
      </div>

      <div className="container relative z-10 flex max-w-2xl flex-col items-start gap-6 py-20 md:py-32">
        <h2 className="display-l text-balance">
          What does the internet actually say about your email?
        </h2>
        <p className="lead text-ink-muted">
          Type in your web address. We look up the records that tell mail providers your email is
          really from you, and show you which are in place and which are missing. It takes about
          five seconds, and it is the same drawing you have been reading all the way down this
          page: solid where we checked it ourselves, dotted where we could not.
        </p>

        <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
          no account · nothing sent · nothing stored
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/check" className={cn(buttonVariants({ size: "lg" }))}>
            Check your domain
          </Link>
          <CtaButton label="Create an account" variant="outline" size="lg" />
        </div>
      </div>
    </section>
  );
}
