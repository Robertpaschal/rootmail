import Link from "next/link";
import { LiveLine, type LiveRow, type Station } from "@rootmail/design";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CtaButton } from "./cta-button";

/**
 * THE HERO IS THE MECHANISM RUNNING, NOT A SENTENCE ABOUT IT.
 *
 * `docs/design/04-EXPERIENCE.md` §5.1. The figure that used to sit here was
 * right and dead: the correct drawing of one real message, redrawn identically
 * on five sections of the page, telling nobody anything the paragraph beside it
 * had not already said. It now RUNS — once, on a `setTimeout` machine, and then
 * it stops. A page that loops forever is performing at you; a page that
 * completes once and stops has just shown you something.
 *
 * What the artifact has to carry on its own, with the headline and the buttons
 * covered up: *it tracks what happens to emails, and it admits when it doesn't
 * know.* That is why the `Clicked` station has no timestamp and the ledger's
 * last row says so in words. The honest gap is the first thing a stranger sees.
 *
 * The rendering law is enforced in `packages/design/src/line.tsx`, not here — a
 * caller cannot promote an inferred station, which is the point of putting it
 * there. `Opened` is hollow forever, in a demo exactly as in production.
 *
 * Three things left this file and are named so nobody puts them back:
 *  - the 47-word lead → 26 words;
 *  - the three-line prose sourcing block, which duplicated the line's own
 *    labels — the ledger rows carry it now;
 */

const sample = {
  id: "msg_01J9Q7F2XKB4M0RVTC8H",
  to: "ana@sunsetvillas.com",
  subject: "Your booking is confirmed",
};

// Clicked has no timestamp, so it is `unknown` and draws dashed. That is the
// honest gap sitting in the hero on purpose: the reader's first impression of
// this product includes something we are declining to claim.
const stations: Station[] = [
  { label: "Queued", state: "witnessed", at: "09:14:02" },
  { label: "Sent", state: "witnessed", at: "09:14:03" },
  { label: "Delivered", state: "witnessed", at: "09:14:07" },
  { label: "Opened", state: "inferred", at: "09:41:55" },
  { label: "Clicked", state: "unknown", at: "—" },
];

const rows: LiveRow[] = [
  { at: "09:14:02", event: "queued", note: "accepted by the API" },
  { at: "09:14:03", event: "sent", note: "handed to the provider" },
  { at: "09:14:07", event: "delivered", note: "provider confirmed" },
  {
    at: "09:41:55",
    event: "opened",
    note: "tracking pixel",
    // Promoted out of the FAQ, where this argument sat at position 8 behind a
    // chevron. It is the product's entire differentiating claim and it costs
    // one click.
    explain:
      "A pixel loaded at 09:41:55. Roughly a third of these are a mail client prefetching an image, so we draw it hollow. Always.",
  },
  { at: "—", event: "clicked", note: "no event · we do not know" },
];

/** Queued at t+0, then Sent, Delivered, Opened, and a settle beat on Clicked. */
const timeline = [0, 400, 1100, 2400, 3400];

export function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="container grid gap-12 py-14 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <h1 className="display-xl text-balance">
            Every email you send, and a record of what happened to it.
          </h1>

          <p className="lead mt-6 max-w-lg text-ink-muted">
            Receipts, campaigns and the replies that come back — one system, one contact list, one
            reputation.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaButton label="Start free" size="lg" arrow />
            <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              See pricing
            </Link>
          </div>

          <p className="mt-6 text-sm text-ink-muted">
            <span className="font-mono text-[13px]" data-fact>
              3,000 sends · 500 contacts · free monthly
            </span>
          </p>
        </div>

        {/* The artifact. Drawn in the DOM so it stays honest as the product
            changes and weighs nothing on a phone. */}
        <figure className="rounded-lg bg-well shadow-well">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
            <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
              {sample.id}
            </span>
            <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
              {sample.to}
            </span>
          </figcaption>

          <p className="px-4 pb-4 pt-3 text-sm font-medium">{sample.subject}</p>

          {/* Two scales rather than one scaled SVG: the station spacing is in
              real pixels so the mono timestamps stay legible, and 504px of hero
              line does not fit a 375px phone. */}
          <div className="border-t border-rule px-4 py-6">
            <LiveLine
              stations={stations}
              rows={rows}
              timeline={timeline}
              scale="page"
              wideScale="hero"
              label="What happened to this message"
            />
            {/* Resend ships five ledger events sharing one timestamp to the
                second, dressed as a live feed. For a product whose thesis is
                that we draw the difference between what we witnessed and what
                we guessed, labelling our own demonstration IS the argument. */}
          </div>
        </figure>
      </div>
    </section>
  );
}
