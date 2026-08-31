import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { CallResponse } from "@/components/site/call-response";
import { CopyLine } from "@/components/site/copy-line";
import { CtaButton } from "@/components/site/cta-button";
import { DevFooter, DevNavbar } from "@/components/site/dev-shell";
import { Idempotency } from "@/components/site/idempotency";
import { Ledger } from "@/components/site/ledger";
import { Proof } from "@/components/site/proof";
import { SubTenancy } from "@/components/site/sub-tenancy";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * THE DEVELOPER SITE — `docs/design/04-EXPERIENCE.md` §8.
 *
 * What was here first: a `blur-[130px]` aurora behind an indigo→violet gradient
 * headline, five `<Badge>` eyebrows over five centred `text-3xl font-bold`
 * headings, four `whyPoints` cards with `bg-primary/10` icon chips, twelve more
 * `surface` cards with icon chips, six check-bullet `guarantees`, a
 * `rounded-2xl` pricing slab — and, in `code-showcase.tsx`, an audit-trail
 * sample that printed
 *
 *     10:01:30  opened
 *
 * at the identical weight as `delivered`. That last one is why this rebuild was
 * urgent rather than cosmetic: an open is a tracking pixel firing, roughly a
 * third of them are a mail client prefetching an image, and we were shipping the
 * category's founding lie on the one page whose entire job is to differentiate
 * us from it. `code-showcase.tsx` is deleted; D2 renders the same events under
 * the rendering law, with `opened` hollow.
 *
 * THE PRINCIPLE THE ORDER FOLLOWS (§8.2). A bakery owner is convinced by
 * watching a mechanism; a developer is convinced by running it and reading the
 * response. So every section here returns something, and the grid — the twelve
 * routes — is quarantined at position 6 of 7, after the argument is made,
 * because a grid asserts breadth and breadth is not the pitch.
 *
 *  D1  the call and the response      what is this?          run it
 *  D2  the ledger                     what do I receive?     filter it
 *  D3  idempotency                    can I trust a retry?   fire it twice
 *  D4  sub-tenancy                    is this for me?        switch identity
 *  D5  proof                          can I prove it?        break it
 *  D6  parity                         what's the surface?    read the routes
 *  D7  close                          what do I do now?      copy one line
 *
 * SEVEN QUESTIONS, SEVEN SHAPES — and the second half of the rebuild.
 *
 * Killing the badges and the centred headings fixed the WORST repetition and
 * left a subtler one: seven full-bleed bands, one padding, one hairline
 * between each, and every one of them opening with a left-aligned heading over
 * a full-width artifact. A reader scrolling that page learns the rhythm by
 * section three and stops reading the headings. So no two adjacent sections
 * share a composition now, and the variation is structural rather than
 * decorative — a different SHAPE per question, not a different colour:
 *
 *  D1  on the bare page ground, type-led, artifact beneath
 *  D2  inverted slab, heading in a sticky 5fr rail beside a 7fr artifact
 *  D3  a narrow slab — visibly less wide than its neighbours — with the
 *      heading and its reading instruction on one baseline row
 *  D4  a stepped slab: two numbered stations, `01` then `02`
 *  D5  one `display-l` line, no lead, artifact beneath, footnote under that
 *  D6  no display heading at all — a mono head row over a ruled table
 *  D7  back on the bare ground, bookending D1
 *
 * D1 and D7 are the two that ask most (run a live send; copy an install line)
 * and they are the two that sit on the page ground rather than on a slab, so
 * the asks are also the moments the page stops looking like a document.
 */

/**
 * D6 — the twelve surfaces, as routes.
 *
 * Every path below was read out of `apps/api/src/routes/` rather than
 * remembered, because on this page the route IS the fact and a wrong one is
 * worse than no table. Two that a plausible guess gets wrong: webhook endpoints
 * live at `/v1/webhook-endpoints`, not `/v1/webhooks` (that path is the inbound
 * provider callback), and proof hangs off a message rather than a top-level
 * `/v1/proof/:id`. A lucide icon beside any of these would be decoration
 * asserting nothing, so there are none.
 */
/**
 * D7's figures, kept as data rather than typed into a sentence.
 *
 * They are the shipping values — `FREE_TX_SENDS` (3,000) and `FREE_TX_DAILY`
 * (500) in `packages/core/src/constants.ts`. They are restated here rather than
 * imported because this app is deliberately standalone with no backend
 * dependency (the same boundary `apps/marketing` keeps), so the note above is
 * the pointer: **if the free allowance changes, it changes there first and this
 * file follows.**
 */
const FREE_SENDS_A_MONTH = "3,000";
const FREE_SENDS_A_DAY = "500";

const surface = [
  { name: "Send", verb: "POST", path: "/v1/messages", note: "idempotent, templated, sandboxed", doc: "messages" },
  { name: "Client domains", verb: "POST", path: "/v1/sub-tenants", note: "per-customer DKIM + verify", doc: "client-domains" },
  { name: "Audit trail", verb: "GET", path: "/v1/messages/:id/audit", note: "append-only, every event", doc: "messages" },
  { name: "Proof exports", verb: "GET", path: "/v1/messages/:id/proof", note: "Ed25519-signed", doc: "compliance" },
  { name: "Webhooks", verb: "POST", path: "/v1/webhook-endpoints", note: "signed, replayable", doc: "webhooks" },
  { name: "Templates", verb: "POST", path: "/v1/templates", note: "the studio's output", doc: "templates" },
  { name: "Contacts", verb: "POST", path: "/v1/contacts", note: "import, segment, suppress", doc: "contacts" },
  { name: "Audiences", verb: "POST", path: "/v1/lists", note: "tags and segments", doc: "lists" },
  { name: "Campaigns", verb: "POST", path: "/v1/campaigns/:id/send", note: "scheduled, A/B by tag", doc: "campaigns" },
  { name: "Sequences", verb: "POST", path: "/v1/sequences/:id/enroll", note: "multi-step, stop-on-reply", doc: "sequences" },
  { name: "Replies", verb: "GET", path: "/v1/threads", note: "threaded inbound", doc: "threads" },
  { name: "Deliverability", verb: "GET", path: "/v1/deliverability", note: "score, rates, fixes", doc: "sending-provider" },
];

export default function DevelopersHome() {
  return (
    <>
      <DevNavbar />
      {/* The gutter is what makes the curve on each slab legible — a
          full-bleed rounded section has nothing to be rounded against. */}
      <main className="space-y-4 px-3 pb-4 sm:px-5">
        {/* ── D1 · on the bare ground ─────────────────────────────────────
            No slab. The hero and the close are the page's two asks, and they
            are the two places the page is not a document.

            THE ARRANGEMENT, AFTER THE OWNER'S NOTE (2026-08-31):

              "'One call to send, one honest word back' and then there is a
               whole empty space on the right. Not necessarily bad, but the
               arrangement of this particular header can be done better — the
               arrangement of information and the presentation of the
               information."

            It was one `max-w-xl` column: headline, lead, two buttons, and then
            570px of nothing to the right of all three, for the full height of
            the block. The fold's first impression was a third of a page in use.

            It is a two-column masthead now — the shape a broadsheet uses for
            exactly this problem. The headline holds the left seven columns and
            keeps its own measure; the lead and the two controls move to the
            right five and sit on the headline's LAST BASELINE (`lg:items-end`),
            so the two blocks close on the same line instead of both starting at
            the top and one of them stopping early. Nothing was added to fill
            space and nothing was cut: the same four elements, arranged so the
            band has no hole in it.

            Underneath, the call/response diptych is unchanged. It was already
            the right shape — the call on the left, the word back on the right,
            which is the headline read left to right. */}
        <section className="container py-14 md:py-20">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-7 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <h1 className="display-xl text-balance">One call to send. One honest word back.</h1>
            <div className="lg:pb-1">
              <p className="lead text-ink-muted">
                Bearer auth, snake_case JSON, a typed Node SDK. Press Send it and read what the real
                sandbox returns.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <CtaButton label="Get an API key" size="lg" arrow />
                <Link
                  href="/docs"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-12 md:mt-14">
            <CallResponse />
          </div>
        </section>

        {/* ── D2 · inverted slab, heading in a sticky rail ────────────────
            The one section whose artifact is tall enough that a heading at the
            top would be off-screen by the time you were reading the rows it
            describes — so it rides along beside them. */}
        <section id="ledger" className="slab ground-ink lit-edge settle overflow-hidden">
          <div className="container py-14 md:py-24">
            {/* `grid-cols-[minmax(0,1fr)]`, not a bare `grid`. A grid item's
                default `min-width: auto` refuses to shrink below its content,
                so at 375px the ledger's widest row sized the single implicit
                column and the whole section — heading included — was clipped by
                the slab's `overflow-hidden`. Tailwind's `grid-cols-N` already
                expands to `minmax(0,1fr)`; a bare `grid` does not, which is why
                only the two hand-written track lists on this page had it. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <h2 className="display-m text-balance">
                  We record what we did, not only what happened.
                </h2>
                <p className="lead mt-4 text-ink-muted">
                  One append-only trail. Your customers&apos; throttles and DNS drift arrive on the
                  same webhook as your deliveries.
                </p>
              </div>
              <Ledger />
            </div>
          </div>
        </section>

        {/* ── D3 · a narrow slab ──────────────────────────────────────────
            Width is a structural variable and this is the only section that
            uses it: the claim is small and exact, so the section is too. */}
        <section id="idempotency" className="slab settle">
          <div className="container max-w-4xl py-14 md:py-20">
            {/* The mono line that used to sit out here — "watch the id, the
                status and the header" — is gone. It was a CAPTION set in the
                code face, which §10.1 no longer allows, and it was instructing
                the reader to look for a relationship the layout was not
                drawing. The artifact draws it now: one key in at the top, one
                message out at the bottom. */}
            <h2 className="display-m max-w-2xl text-balance">The same key twice sends once.</h2>
            <p className="lead mt-4 max-w-xl text-ink-muted">
              One key. Two requests. One message — and a response header that names the replay.
            </p>
            <div className="mt-8">
              <Idempotency />
            </div>
          </div>
        </section>

        {/* ── D4 · the trunk and its branches ─────────────────────────────
            The head no longer has to explain that the pieces below are
            related — the artifact is one thing with a spine running down it,
            so the sentence that used to do that work ("Switch identity below
            and the From address, the DKIM selector and the reputation switch
            with it") is deleted rather than reworded. A caption whose job is to
            hold a layout together is a layout that failed. */}
        <section id="client-domains" className="slab settle">
          <div className="container py-14 md:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
              <h2 className="display-m text-balance">
                One integration. A branch for every customer you send for.
              </h2>
              <p className="text-sm text-ink-muted lg:pb-1">
                Their domain, their DKIM key, their reputation — hanging off the one API key you
                already integrated.
              </p>
            </div>
            <div className="mt-10">
              <SubTenancy />
            </div>
          </div>
        </section>

        {/* ── D5 · one line, no lead ──────────────────────────────────────
            The only `display-l` on the page below the hero. It is the section
            that fails on purpose, and it earns the size. */}
        <section id="proof" className="slab settle">
          <div className="container py-14 md:py-24">
            <h2 className="display-l max-w-2xl text-balance">Sign it, verify it, then break it.</h2>
            <div className="mt-10">
              <Proof />
            </div>
            {/* Sans, not mono. §10.1 narrowed mono to ids, timestamps and
                sourcing lines; this is a sentence, and the only recorded value
                in it is the route. */}
            <p className="mt-8 max-w-2xl border-t border-rule pt-4 text-sm text-ink-muted">
              <code className="font-mono text-[12.5px] text-foreground" data-fact>
                POST /v1/proof/verify
              </code>{" "}
              takes a bundle and a signature, needs no key, and answers someone who does not trust
              us.
            </p>
          </div>
        </section>

        {/* ── D6 · mono head, ruled table ─────────────────────────────────
            No display heading. Six sections have made the argument; this one
            is a reference, and a reference opens like a reference.

            FOUR THINGS A CLOSE LOOK AT THE ROWS TURNED UP, AND WHAT EACH FIX IS.

            1. THE SECTION HAD NO HEADING ELEMENT. The head was a `<p>` carrying
               `display-s`, so the one section of this page that is a reference —
               the section a developer arrives at from a search result — was
               missing from the document outline entirely. It is an `<h2>` now.
               `font-sans` keeps it looking exactly as it did: the base layer
               puts the display face on every `h2`, and the whole point of this
               head is that it is NOT a display heading.

            2. THE ROUTE WAS THE DIMMEST TEXT IN ITS OWN ROW. §8.4 says "for a
               developer the route IS the fact", and it shipped at 12px in
               `text-ink-muted` — 6.43:1, the smallest and faintest thing on the
               line — while the section title beside it ran at 14.38:1. The path
               takes full ink at 12.5px now and the VERB keeps the muted cut, so
               the row has an order to read it in: what it is, where it is, what
               it does. Colour is untouched: this is a lightness step, not a hue.

            3. TWELVE LINKS WITH NOTHING SAYING SO. Every row navigates into
               `packages/docs` and the only evidence was a `hover:bg-muted` —
               which does not exist on a touch device, where half the readers
               are. A persistent chevron sits after each name (where the eye
               starts, and legible at 375px where a right-rail arrow would have
               had to be hidden); it goes brass and steps 2px right on hover or
               keyboard focus, which is §10.2's "brass = you can act on this"
               used on the thing that actually is one. Rows also had no
               `focus-visible` treatment at all.

            4. A 322px RIVER THROUGH THE MIDDLE OF EVERY ROW. `3fr 5fr 4fr` gave
               the path a 453px track to hold ~155px of text, so the note landed
               at x=838 with a third of the row empty between them. The path
               column is a fixed `15rem` — fixed rather than `auto` because each
               row is its OWN grid, so an `auto` track would size per row and the
               twelve paths would no longer align — and the note follows it
               directly. The space that is left now falls at the END of the row,
               where it reads as a short line rather than as two islands.

            AND WHAT THIS SECTION IS NOT: a pinned scene. `05-ENGAGEMENT.md`
            §5.1's sticky rig (a `position: sticky` child in a parent 2–4× the
            viewport, advancing through states as you scroll the surplus) is the
            right mechanic for a NARRATIVE — one message moving through its
            stations. It is the wrong one here, for two reasons that are not
            taste. §8.4 already settled the shape with `01-REFERENCES.md §A.9`'s
            catalogue test — *could a reader act on one row alone?* Yes, each row
            is a route they can call — and a pin destroys the two things that
            make a catalogue useful: you cannot scan twelve routes at once and
            you cannot find-in-page for `sub-tenants`. Second, a pin costs ~2,800
            px of scroll, and paying it would mean writing twelve request/
            response pairs; the ones we could not read straight out of
            `apps/api/src/routes/` we would be inventing, which is the one thing
            this page may never do. Three thousand pixels to say less than a
            52px row is not engagement. The scroll here does something cheaper
            and truer: the slab settles, and every row is a link that says so. */}
        <section id="parity" className="slab settle">
          <div className="container py-14 md:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-rule pb-3">
              <h2 className="display-s font-sans">Everything the dashboard does, the API does.</h2>
              <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
                12 of them · every one documented
              </p>
            </div>
            <div className="ruled">
              {surface.map((s) => (
                <Link
                  key={s.path}
                  href={`/docs/${s.doc}`}
                  className="group grid grid-cols-1 gap-x-6 gap-y-1 rounded-md px-2 py-3.5 transition-colors duration-interaction ease-interaction hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,3fr)_15rem_minmax(0,6fr)] md:items-baseline"
                >
                  <span className="flex items-center gap-1.5 text-[0.9375rem] font-medium">
                    {s.name}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-ink-muted transition-[transform,color] duration-interaction ease-interaction group-hover:translate-x-0.5 group-hover:text-brass-text group-focus-visible:translate-x-0.5 group-focus-visible:text-brass-text motion-reduce:transition-none motion-reduce:group-hover:transform-none"
                    />
                  </span>
                  <span className="font-mono text-[12.5px] text-foreground" data-fact>
                    <span className="inline-block w-10 text-ink-muted">{s.verb}</span>
                    {s.path}
                  </span>
                  <span className="text-[0.8125rem] text-ink-muted">{s.note}</span>
                </Link>
              ))}
            </div>
            {/* The aggregate action for this band. Twelve rows go to twelve
                pages; a reader who wants the other sixteen had no way to ask
                for them from here. Brass, because it is the one thing in the
                section that is not already a row. */}
            <div className="mt-8 flex justify-center">
              <Link
                href="/docs"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brass-text underline-offset-4 transition-colors duration-interaction ease-interaction hover:underline"
              >
                Read the full reference
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── D7 · back on the bare ground, and the number is the headline ─
            THE STAT WAS THE WEAKEST THING IN THE STRONGEST POSITION.

            It shipped as `3,000 sends a month, free. Sandbox sends never count.`
            set in JetBrains Mono at 13px in `text-ink-muted` — 6.98:1 — wedged
            between the install line and the buttons, left-aligned, the fourth of
            four things in the band and visually the last of them. Two rules were
            being broken at once. §10.1 withdrew "mono marks every recorded
            value" precisely because it "put the most important numbers on every
            page into the least legible face on the page", and it is a SENTENCE,
            which mono is no longer for at all.

            So the number IS the heading now: `3,000` in the display face with
            lining tabular figures at up to 9rem, and the sentence that used to
            carry it demoted to its label. Presence comes from SIZE and
            TIGHTNESS (§10 opening) — not from a new colour, and not from brass,
            which stays on the single button below so that the loudest thing in
            the band and the thing we want pressed are not competing.

            CENTRED, AND ALONE IN ITS BAND. The section was `items-start` with
            four stacked elements; it is centred with three, and the secondary
            route out ("Read the docs") is a text link rather than a second
            large outlined button, so exactly one control here reads as a button.

            THE NUMBERS ARE THE REAL ONES, not marketing copy: `FREE_TX_SENDS`
            and `FREE_TX_DAILY` in `packages/core/src/constants.ts` are 3,000 and
            500, and the daily figure matters — it is a real burst guard, and
            omitting it was the kind of quiet overclaim this site exists to
            refuse. "Sandbox sends never count" is checked too:
            `apps/api/src/routes/messages.ts:326` only consumes the quota when
            `mode === "live"`.

            The figure rises the last 14px as it enters the viewport, on
            `animation-timeline: view()` behind `@supports` — scroll position,
            not a clock, transform only, and 22px-low-but-complete is its worst
            case. See `.figure-rise` in `globals.css`. */}
        <section
          id="start"
          className="container flex flex-col items-center py-20 text-center md:py-28"
        >
          <h2 className="flex flex-col items-center">
            <span className="display-num figure-rise block text-[clamp(4.5rem,14vw,9rem)] leading-[0.85] tracking-[-0.03em]">
              {FREE_SENDS_A_MONTH}
            </span>
            <span className="display-m mt-3 font-sans font-medium">sends a month, free</span>
          </h2>
          <p className="mt-4 max-w-[48ch] text-balance text-[15px] text-ink-muted">
            {FREE_SENDS_A_DAY} a day, no card.{" "}
            <Link
              href="/docs/sandbox"
              className="whitespace-nowrap text-brass-text underline-offset-4 transition-colors duration-interaction ease-interaction hover:underline"
            >
              Sandbox sends
            </Link>{" "}
            never count.
          </p>

          {/* `text-left` because the band is centred and a command is not a
              sentence — it is a string you are about to retype, and a centred
              one reads as decoration. The BOX is centred; its contents are not. */}
          <CopyLine command="npm i @rootmail/node" className="mt-10 text-left" />

          <CtaButton label="Get an API key" size="lg" arrow className="mt-6" />
          <Link
            href="/docs"
            className="mt-4 inline-flex min-h-11 items-center text-sm text-ink-muted underline-offset-4 transition-colors duration-interaction ease-interaction hover:text-foreground hover:underline"
          >
            Read the docs
          </Link>
        </section>
      </main>
      <DevFooter />
    </>
  );
}
