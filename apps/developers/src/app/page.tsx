import Link from "next/link";
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
            are the two places the page is not a document. */}
        <section className="container py-14 md:py-20">
          <div className="max-w-xl">
            <h1 className="display-xl text-balance">One call to send. One honest word back.</h1>
            <p className="lead mt-6 text-ink-muted">
              Bearer auth, snake_case JSON, a typed Node SDK. Press Send it and read what the real
              sandbox returns.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton label="Get an API key" size="lg" arrow />
              <Link href="/docs" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                Read the docs
              </Link>
            </div>
          </div>
          <div className="mt-12">
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
              <h2 className="display-m text-balance">The same key twice sends once.</h2>
              <p className="font-mono text-[11px] text-ink-muted" data-fact>
                watch the id, the status and the header
              </p>
            </div>
            <div className="mt-8">
              <Idempotency />
            </div>
          </div>
        </section>

        {/* ── D4 · stepped ────────────────────────────────────────────────
            Onboarding a customer's domain is a two-station journey and the
            artifact already has two columns, so the columns get their station
            numbers. */}
        <section id="client-domains" className="slab settle">
          <div className="container py-14 md:py-24">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-14">
              <h2 className="display-m text-balance">
                Onboard a customer&apos;s domain, get the DNS table back.
              </h2>
              <p className="text-sm text-ink-muted">
                Switch identity below and the From address, the DKIM selector and the reputation
                switch with it.
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
            is a reference, and a reference opens like a reference. */}
        <section id="parity" className="slab settle">
          <div className="container py-14 md:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-rule pb-3">
              <p className="display-s">Everything the dashboard does, the API does.</p>
              <p className="font-mono text-[11px] text-ink-muted" data-fact>
                12 of them · every one documented
              </p>
            </div>
            <div className="ruled">
              {surface.map((s) => (
                <Link
                  key={s.path}
                  href={`/docs/${s.doc}`}
                  className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md px-2 py-3.5 transition-colors duration-interaction ease-interaction hover:bg-muted md:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,4fr)] md:items-baseline"
                >
                  <span className="text-[0.9375rem] font-medium">{s.name}</span>
                  <span className="font-mono text-[12px] text-ink-muted" data-fact>
                    <span className="inline-block w-10">{s.verb}</span>
                    {s.path}
                  </span>
                  <span className="text-[0.8125rem] text-ink-muted">{s.note}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── D7 · back on the bare ground ────────────────────────────────*/}
        <section id="start" className="container flex flex-col items-start gap-6 py-16 md:py-24">
          <h2 className="display-l max-w-xl text-balance">Start with one line.</h2>
          <CopyLine command="npm i @rootmail/node" />
          <p className="font-mono text-[13px] text-ink-muted" data-fact>
            3,000 sends a month, free. Sandbox sends never count.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CtaButton label="Get an API key" size="lg" arrow />
            <Link href="/docs" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Read the docs
            </Link>
          </div>
        </section>
      </main>
      <DevFooter />
    </>
  );
}
