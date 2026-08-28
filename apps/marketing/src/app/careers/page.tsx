import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/site/footer";
import { Navbar } from "@/components/site/navbar";
import { Reveal } from "@/components/site/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "rootmail is an early-stage team rebuilding email infrastructure from the ground up. We're not actively hiring yet — but if you push boundaries, we'd love to know you.",
};

/**
 * `/careers` — four questions, four shapes.
 *
 *  C1  who is asking?      bare page ground, type-led
 *  C2  why does it matter? inverted slab, ONE display line and no lead, with
 *                          three mono facts under it — the shape says the
 *                          claim is short and does not need arguing
 *  C3  how do you work?    a table with a mono head row and no display heading:
 *                          four principles and, in the second column, what each
 *                          one COSTS us. A principle with no cost is a slogan,
 *                          and a table is what makes the pairing unavoidable
 *  C4  can I join?         back on the bare ground, the honest answer first
 *
 * WHAT THIS REPLACES. A centred hero, 120 words of unbroken prose, a centred
 * heading over four bordered cards with tinted icon chips, and a centred
 * bordered box holding a 75-word paragraph — the same five-part shape as
 * `/about`, which is how a reader learns that neither page is worth reading
 * closely.
 */

const principles = [
  {
    name: "Think from first principles",
    cost: "we rebuild things that already work, when we can do them better",
  },
  {
    name: "Ship things that are real",
    cost: "we cut claims from the site when the code does not back them",
  },
  {
    name: "Serve everyone who sends",
    cost: "two front doors to design, and neither may be the lesser one",
  },
  {
    name: "Sweat the unglamorous parts",
    cost: "suppression and audit trails get the same care as the studio",
  },
];

export default function CareersPage() {
  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── C1 · bare ground, type-led ─────────────────────────────────── */}
        <section className="container py-14 md:py-24">
          <Reveal className="max-w-3xl">
            <h1 className="display-xl text-balance">Help us rebuild email from the ground up.</h1>
            <p className="lead mt-6 max-w-xl text-ink-muted">
              A small, early-stage team making the infrastructure behind every email simple enough
              to run and trustworthy enough to bet a business on.
            </p>
          </Reveal>
        </section>

        {/* ── C2 · inverted slab, one line, no lead ───────────────────────── */}
        <section className="slab settle ground-ink lit-edge">
          <div className="container py-16 md:py-24">
            <Reveal inView>
              <h2 className="display-l max-w-3xl text-balance">
                Most people think email is a solved problem. It is not.
              </h2>
              <div className="ruled mt-10 max-w-xl border-y border-rule font-mono text-[11px] text-ink-muted">
                <p className="py-2.5" data-fact>
                  reaching the inbox · nobody can promise it · unsolved
                </p>
                <p className="py-2.5" data-fact>
                  proving what you sent · almost no tool does it
                </p>
                <p className="py-2.5" data-fact>
                  isolating one sender from another · rebuilt from nothing, every time
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── C3 · a table, mono head row, no display heading ─────────────── */}
        <section className="slab settle">
          <div className="container py-14 md:py-20">
            <Reveal inView className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="py-2.5 pr-8 font-normal">how we work</th>
                    <th className="py-2.5 font-normal">what it costs us</th>
                  </tr>
                </thead>
                <tbody>
                  {principles.map((p) => (
                    <tr key={p.name} className="border-b border-rule align-baseline last:border-0">
                      <td className="py-4 pr-8">
                        <span className="display-s">{p.name}</span>
                      </td>
                      <td className="py-4 text-[0.9375rem] leading-relaxed text-ink-muted">
                        {p.cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* ── C4 · back on the bare ground, honest answer first ───────────── */}
        <section className="container flex flex-col items-start gap-6 py-16 md:py-24">
          <h2 className="display-l max-w-2xl text-balance">
            We are not posting roles right now.
          </h2>
          <p className="lead max-w-xl text-ink-muted">
            We are early and deliberate about who joins. Introduce yourself anyway — what you have
            made, and what you would want to make here. We read every message.
          </p>
          <p className="font-mono text-[11px] text-ink-muted" data-fact>
            open roles · 0 · we will say so here when that changes
          </p>
          <Link href="/contact" className={cn(buttonVariants({ size: "lg" }))}>
            Introduce yourself
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
