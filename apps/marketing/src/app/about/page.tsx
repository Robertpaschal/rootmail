import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { Reveal } from "@/components/site/motion";
import { CtaButton } from "@/components/site/cta-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why rootmail exists: every email your business sends — receipts and newsletters — finally in one place, simple enough for a non-technical team and deep enough for an engineer.",
};

/**
 * `/about` — six questions, six shapes.
 *
 * WHAT THIS REPLACES. Five sections, four of which opened with a centred
 * heading over a lead paragraph and then laid out a grid of bordered cards with
 * a tinted icon chip in the corner — twice — with 340 words of unbroken prose
 * between them. A reader learned the rhythm by the second section and stopped
 * reading the headings, which is the diagnosis in `docs/design/02-AUDIT.md` and
 * the reason the developer site was rebuilt.
 *
 *  A1  what is this?        bare page ground, type-led, no panel
 *  A2  what is wrong now?   inverted slab, a ledger whose right column is
 *                           DOTTED — the shape is the argument: four tools,
 *                           and the thing none of them knows
 *  A3  what did we build?   a stepped slab, 01 / 02 / 03, because the layers
 *                           genuinely are a progression you turn on in order
 *  A4  who is it for?       one panel split by a single vertical rule — two
 *                           front doors, one product, no cards
 *  A5  what do we believe?  three full-width statements, each with the line of
 *                           code that makes it true underneath
 *  A6  what now?            back on the bare ground, bookending A1
 */

/* A2. The right column is what none of these tools knows about the others.
   It renders under the rendering law's `unknown` treatment — a dotted rule —
   because that is precisely its state: nobody observed it, so nobody can act
   on it. */
const stack = [
  { tool: "A service for receipts", blind: "who asked you to stop emailing them" },
  { tool: "A tool for newsletters", blind: "which addresses bounced yesterday" },
  { tool: "A tool for sales sequences", blind: "either of the two above" },
  { tool: "A spreadsheet of opt-outs", blind: "nothing enforces it at send time" },
];

/* A3. Three layers, in the order you turn them on. */
const layers = [
  {
    n: "01",
    name: "Send",
    body: "One message, authenticated, with a record of what happened to it.",
    fact: "messages · audit_entries · append-only",
  },
  {
    n: "02",
    name: "Converse",
    body: "The reply comes back to a thread instead of a mailbox nobody reads.",
    fact: "threads · one inbox · both wings",
  },
  {
    n: "03",
    name: "Prove",
    body: "A signed bundle a third party can check without trusting us.",
    fact: "ed25519 · pins a content hash",
  },
];

/* A5. Three beliefs, each with the mechanism that makes it true. A belief with
   no mechanism under it is a value statement, and this page has none. */
const beliefs = [
  {
    claim: "An unsubscribe means everywhere.",
    fact: "suppressions · enforced at send · both wings",
  },
  {
    claim: "A number without a window is not a number.",
    fact: "every figure · window · method",
  },
  {
    claim: "We never draw a solid line through something we did not observe.",
    fact: "opened · inferred · hollow, forever",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── A1 · bare ground, type-led ─────────────────────────────────── */}
        <section className="container py-14 md:py-24">
          <Reveal className="max-w-3xl">
            <h1 className="display-xl text-balance">
              Email is a chain of custody. Nobody was keeping the record.
            </h1>
            <p className="lead mt-6 max-w-xl text-ink-muted">
              rootmail sends your email and can account for every piece of it — including the email
              you send on someone else&apos;s behalf.
            </p>
            <p className="mt-6 font-mono text-[11px] text-ink-muted" data-fact>
              one core · two wings · one record per message
            </p>
          </Reveal>
        </section>

        {/* ── A2 · inverted slab, a ledger with a dotted column ───────────── */}
        <section className="slab settle ground-ink lit-edge">
          <div className="container py-14 md:py-20">
            <Reveal inView className="max-w-2xl">
              <h2 className="display-l text-balance">
                Grow past the basics and email becomes four products.
              </h2>
            </Reveal>

            <Reveal inView delay={0.05} className="ruled mt-10 border-y border-rule">
              {stack.map((s) => (
                <div
                  key={s.tool}
                  className="grid items-baseline gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
                >
                  <p className="display-s">{s.tool}</p>
                  <p className="flex items-center gap-3 text-[0.9375rem] text-ink-muted">
                    {/* `unknown` in the rendering law: a dotted rule, because
                        nothing here observed anything. 1px on, 4px off — the
                        crosshair recipe, no SVG. */}
                    <span
                      aria-hidden="true"
                      className="hidden h-px w-10 shrink-0 sm:block"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(to right, hsl(var(--line-dim)) 0 1px, transparent 1px 5px)",
                      }}
                    />
                    does not know {s.blind}
                  </p>
                </div>
              ))}
            </Reveal>

            <Reveal inView delay={0.1}>
              <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-muted">
                None of them share a contact, a reputation or a history. The day you switch, you
                re-import everything and start your deliverability at zero.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── A3 · stepped, 01 / 02 / 03 ─────────────────────────────────── */}
        <section className="slab settle">
          <div className="container py-14 md:py-20">
            <Reveal inView className="max-w-2xl">
              <h2 className="display-m text-balance">You never re-platform. You turn on the next layer.</h2>
            </Reveal>

            <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
              {layers.map((l, i) => (
                <Reveal key={l.n} inView delay={0.05 * i}>
                  <div className="border-t-2 border-ink pt-4">
                    <p className="display-num text-4xl font-semibold leading-none">{l.n}</p>
                    <h3 className="display-s mt-4">{l.name}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-muted">{l.body}</p>
                    <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
                      {l.fact}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── A4 · one panel, split by a single rule ──────────────────────── */}
        <section className="slab settle">
          <div className="container max-w-4xl py-14 md:py-20">
            <Reveal inView>
              <h2 className="display-m text-balance">Two front doors. One product.</h2>
            </Reveal>

            <Reveal inView delay={0.05}>
              <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-0">
                <div className="md:pr-10">
                  <h3 className="display-s text-balance">
                    For people who just want to reach their people
                  </h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                    One place to design an email, build a list, send a campaign, follow up and read
                    what comes back.
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
                    studio · campaigns · inbox · no code
                  </p>
                </div>
                <div className="border-t border-rule pt-8 md:border-l md:border-t-0 md:pl-10 md:pt-0">
                  <h3 className="display-s text-balance">
                    For developers who would rather not become email operators
                  </h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
                    The same product, through a REST API, a typed Node SDK and a CLI. The same data,
                    the same records.
                  </p>
                  <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
                    idempotent sends · webhooks · sub-tenancy
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── A5 · three full-width statements ────────────────────────────── */}
        <section className="slab settle">
          <div className="container py-14 md:py-20">
            <div className="ruled border-y border-rule">
              {beliefs.map((b, i) => (
                <Reveal key={b.claim} inView delay={0.04 * i}>
                  <div className="py-8">
                    <h2 className="display-m max-w-3xl text-balance">{b.claim}</h2>
                    <p className="mt-3 font-mono text-[11px] text-ink-muted" data-fact>
                      {b.fact}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── A6 · back on the bare ground ───────────────────────────────── */}
        <section className="container flex flex-col items-start gap-6 py-16 md:py-24">
          <h2 className="display-l max-w-2xl text-balance">
            If email is the part of your product you cannot account for, that is the part we built.
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <CtaButton label="Start sending" size="lg" arrow />
            <Link
              href="/contact"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Get in touch
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
