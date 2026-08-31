import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicPricing } from "@/lib/pricing";
import { Reveal } from "./motion";
import { CtaButton } from "./cta-button";
import { BlocksCalculator, ContactPricer } from "./pricing-calculators";

/**
 * `/pricing` — the page's OWN sections, seven questions in seven shapes.
 *
 * WHAT THIS REPLACES. The page used to be `<PricingArgument/>` + `<Pricing/>` +
 * `<Cta/>` — one page-specific block bolted onto homepage positions 7 and 9. A
 * reader arriving from the nav met the same slab, the same two-up calculator
 * card, the same dark close they had already scrolled past, and the page's own
 * argument was three ruled rows at the top that nobody reaches for before they
 * have seen a number.
 *
 * The homepage keeps `<Pricing addons={false}/>` untouched. This file borrows
 * only the two calculators, because they are the artifacts and they are real:
 * they run the same block and per-contact maths the product bills on, against
 * the live catalog.
 *
 * SEVEN QUESTIONS, SEVEN SHAPES — and each shape is an argument about its own
 * content, not a different colour of the same box:
 *
 *  P1  what am I paying for?     bare page ground, type-led, no panel at all
 *  P2  what does it cost?        one slab, TWO EQUAL COLUMNS — the wings are
 *                                independent and neither is the real product
 *  P3  what if I go over?        a narrow slab, one display line, no lead
 *  P4  what is behind a plan?    inverted slab, a real TABLE whose middle
 *                                column says "included" seven times
 *  P5  what can I add?           a mono head row over a catalogue grid
 *  P6  what am I still worried?  sticky rail left, ruled answers right
 *  P7  what do I do now?         back on the bare ground, bookending P1
 *
 * P1 and P7 are the only two on the page ground rather than on a slab, so the
 * page opens and closes by not looking like a document.
 */

const num = (n: number) => n.toLocaleString();

/* ─── P4 ────────────────────────────────────────────────────────────────────
   Every row is a capability a competitor files under a tier. The middle column
   is the argument: it says the same word seven times, which is a thing a table
   can do and a paragraph cannot. It is set in ink, not in `--witnessed`: the
   three signal colours mean what happened to a MESSAGE and a plan is not a
   message (`00-PHILOSOPHY.md` §10.2). The repetition is doing the work. The right column is where it lives in the
   data model, because "part of the model" is the actual reason it is not a
   tier — a claim is cheaper to make than a column name. */
const included: { what: string; plan: string; where: string }[] = [
  { what: "A sending domain per client", plan: "included", where: "domains · dkim_keys · per client" },
  { what: "Their own suppression list", plan: "included", where: "suppressions · scope: client" },
  { what: "Their own reputation score", plan: "included", where: "tenant_scores · 7d trailing" },
  { what: "An append-only audit trail", plan: "included", where: "audit_entries · never updated" },
  { what: "A signed proof bundle", plan: "included", where: "ed25519 · pins a content hash" },
  { what: "Replies, threaded, both wings", plan: "included", where: "threads · one inbox" },
  { what: "The API, the SDK, the CLI", plan: "included", where: "same routes as the dashboard" },
];

/* ─── P6 ────────────────────────────────────────────────────────────────────
   The three things anybody actually worries about at the edges of a price
   list. Answers are capped at 35 words; the mono line under each carries the
   number, the route or the threshold, which is what makes it a fact and not a
   shorter sentence. */
const edges = [
  {
    q: "Can a bill surprise me?",
    a: "No. Free tiers pause at the cap instead of charging you; a paid wing bills overage at a rate you saw first.",
    fact: "free · pauses at cap · never auto-charges",
  },
  {
    q: "What if I only need one half?",
    a: "Then pay for one half. The wings bill independently, and being free on one side does not touch the other.",
    fact: "two bills · either one can be $0",
  },
  {
    q: "What happens to a price I already have?",
    a: "It holds. Buying more of an add-on never re-bills what you already have.",
    fact: "yearly · 2 months free · plans + add-ons",
  },
];

/* ═══ P1 · the claim, on the bare page ground ══════════════════════════════ */
export function PricingClaim() {
  return (
    <section className="container py-14 md:py-24">
      <Reveal className="max-w-3xl">
        <h1 className="display-xl text-balance">You pay for volume, not for permission.</h1>
        <p className="lead mt-6 max-w-xl text-ink-muted">
          The calculators below run the same maths the product bills on, against the live catalog. A
          number here and a number at checkout cannot disagree.
        </p>
        <p className="mt-6 font-mono text-[12.5px] text-ink-muted" data-fact>
          two wings · two bills · either one can be $0
        </p>
      </Reveal>
    </section>
  );
}

/* ═══ P2 · two equal columns ═══════════════════════════════════════════════ */
export function PricingMeters({ pricing }: { pricing: PublicPricing }) {
  return (
    <section id="pricing" className="slab settle lit lit-edge">
      <div className="container py-14 md:py-20">
        <Reveal inView className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <h2 className="display-m text-balance">Size it yourself.</h2>
          <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
            live catalog · sale prices included
          </p>
        </Reveal>

        {/* What can be sent TODAY, before a calculator runs to millions. The
            number comes from the API, which reads the same env the cap is
            enforced from, so the page cannot drift from the gate. */}
        {pricing.beta?.active ? (
          <div className="mt-8 max-w-3xl border-l-2 border-acted pl-4">
            <p className="text-sm font-medium">
              rootmail is in closed beta — every account is capped at{" "}
              <span className="font-mono" data-fact>
                {pricing.beta.daily_send_cap}
              </span>{" "}
              sends a day right now
            </p>
          </div>
        ) : null}

        <Reveal inView delay={0.05} className="mt-10 grid items-stretch gap-6 lg:grid-cols-2">
          <BlocksCalculator tx={pricing.wings.transactional} />
          <ContactPricer mk={pricing.wings.marketing} />
        </Reveal>
      </div>
    </section>
  );
}

/* ═══ P3 · a narrow slab, one line, no lead ════════════════════════════════
   The only section on the page that is visibly less wide than its neighbours.
   The claim is one sentence long and exact, so the section is too — and it is
   the one thing the calculators above cannot say about themselves, because a
   calculator that reads $0 looks like a countdown to somebody who has been
   burned by a trial. */
export function PricingFloor({ pricing }: { pricing: PublicPricing }) {
  const tx = pricing.wings.transactional;
  const mk = pricing.wings.marketing;
  return (
    <section className="slab settle">
      <div className="container max-w-3xl py-14 md:py-20">
        <Reveal inView>
          <h2 className="display-l text-balance">The free tier is not a trial.</h2>
          <p className="mt-6 font-mono text-[12.5px] text-ink-muted" data-fact>
            transactional · {num(tx.free_sends)} sends/mo · free · no expiry
          </p>
          <p className="mt-1.5 font-mono text-[12.5px] text-ink-muted" data-fact>
            marketing · {num(mk.free_contacts)} contacts · free · no expiry
          </p>
          <p className="mt-1.5 font-mono text-[12.5px] text-ink-muted" data-fact>
            both · pause at the cap · never auto-charge
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══ P4 · inverted slab, a real table ═════════════════════════════════════ */
export function PricingIncluded() {
  return (
    <section className="slab settle ground-ink lit-edge">
      <div className="container py-14 md:py-20">
        <Reveal inView className="max-w-2xl">
          <h2 className="display-m text-balance">
            Sending for your own customers is not a tier.
          </h2>
        </Reveal>

        <Reveal inView delay={0.05} className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left">
            <thead>
              <tr className="border-y border-rule font-mono text-[12.5px] uppercase tracking-wide text-ink-muted">
                <th className="py-2.5 pr-6 font-normal">what each client gets</th>
                <th className="py-2.5 pr-6 font-normal">plan required</th>
                <th className="py-2.5 font-normal">where it lives</th>
              </tr>
            </thead>
            <tbody className="ruled">
              {included.map((r) => (
                <tr key={r.what} className="border-t border-rule align-baseline">
                  <td className="py-3 pr-6 text-[0.9375rem]">{r.what}</td>
                  <td className="py-3 pr-6 font-mono text-[12.5px] text-foreground" data-fact>
                    {r.plan}
                  </td>
                  <td className="py-3 font-mono text-[12.5px] text-ink-muted" data-fact>
                    {r.where}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>

        <Reveal inView delay={0.1}>
          <p className="mt-8 max-w-xl text-sm leading-relaxed text-ink-muted">
            Mailgun gates subaccounts behind its Scale plan, from $90 a month. Ours are part of the
            data model, so the free plan has them.
          </p>
          <p className="mt-2 font-mono text-[12.5px] text-ink-muted" data-fact>
            competitor gate · Mailgun published pricing
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══ P5 · a mono head row over a catalogue grid ═══════════════════════════
   No display heading — five sections have made the argument and this one is a
   price list. An add-on is a thing a reader can buy on its own, which is the
   test from `01-REFERENCES.md §A.9` for when a grid is the honest shape, and
   it is the only grid on the page.

   TWO columns, not three. Measured: at three across, this section carried 311
   words in 822px — 378 words per 1,000px against a reference band of 108–176,
   which is a wall of text with hairlines in it. The price is the thing a
   reader is here for, so it is set as a FIGURE in the display face at the foot
   of each cell rather than as another line of small mono. */
export function PricingAddons({ pricing }: { pricing: PublicPricing }) {
  const { addons } = pricing;
  return (
    <section className="slab settle">
      <div className="container max-w-5xl py-16 md:py-24">
        <Reveal
          inView
          className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-rule pb-3 font-mono text-[12.5px] uppercase tracking-wide text-ink-muted"
        >
          <span>add-ons · priced per one</span>
          <span data-fact>no plan required · buy one on its own</span>
        </Reveal>

        <Reveal inView delay={0.05} className="mt-8 grid gap-x-12 sm:grid-cols-2">
          {addons.map((a) => {
            const onSale = a.sale_price != null;
            const price = `$${onSale ? a.sale_price : a.unit_amount}`;
            return (
              <div
                key={a.id}
                className="flex min-h-[12rem] flex-col border-b border-rule py-8"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="display-s">{a.name}</p>
                  {onSale ? (
                    <span className="shrink-0 font-mono text-[12px] text-acted" data-fact>
                      {a.sale_percent_off}% off
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-ink-muted">
                  {a.description}
                </p>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="display-num text-2xl font-semibold leading-none" data-fact>
                    {price}
                  </span>
                  {onSale ? (
                    <span className="font-mono text-[12.5px] text-ink-muted line-through">
                      ${a.unit_amount}
                    </span>
                  ) : null}
                  <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                    /mo per {a.unit}
                  </span>
                </p>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

/* ═══ P6 · sticky rail left, ruled answers right ═══════════════════════════
   Three worries against one topic, so the topic holds still while they scroll
   past it. The rail is `lg:sticky` only — at one column a sticky heading is a
   heading that will not go away. */
export function PricingEdges() {
  return (
    <section className="slab settle">
      <div className="container py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="display-m text-balance">The edges of the bill.</h2>
            <p className="mt-4 font-mono text-[12.5px] text-ink-muted" data-fact>
              three questions · answered in full
            </p>
          </div>

          <div className="ruled border-y border-rule">
            {edges.map((e, i) => (
              <Reveal key={e.q} inView delay={0.04 * i}>
                <div className="py-6">
                  <h3 className="display-s text-balance">{e.q}</h3>
                  <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
                    {e.a}
                  </p>
                  <p className="mt-2.5 font-mono text-[12.5px] text-ink-muted" data-fact>
                    {e.fact}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══ P7 · back on the bare ground ═════════════════════════════════════════ */
export function PricingClose() {
  return (
    <section className="container flex flex-col items-start gap-6 py-16 md:py-24">
      <h2 className="display-l max-w-2xl text-balance">Start on the free tier. Both of them.</h2>
      <p className="font-mono text-[12.5px] text-ink-muted" data-fact>
        no card · no sales call · both wings free to start
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <CtaButton label="Start free" size="lg" arrow />
        <Link
          href="/contact?topic=sales"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          Talk about committed volume
        </Link>
      </div>
    </section>
  );
}
