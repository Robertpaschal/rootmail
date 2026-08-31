import Link from "next/link";
import { getPublicPricing } from "@/lib/pricing";
import { Reveal } from "./motion";
import { CtaButton } from "./cta-button";
import { BlocksCalculator, ContactPricer } from "./pricing-calculators";

// The floor every account shares — so the two wings are about what THEY do,
// not table stakes.
const baseline = [
  "visual studio · no code",
  "AI assistant",
  "replies · shared inbox",
  "score · suppression · webhooks",
  "signed proof",
  "API · SDKs · docs",
];

/**
 * Pricing sells the REAL model: two independent wings (transactional = send
 * volume, marketing = audience size) + add-ons priced per one. Add-ons are filed
 * under a wing in the catalog, but that is a pricing detail — any of them can be
 * bought on its own, and buying one never touches a wing's bill.
 * Numbers come live from the public catalog (sales included), so this page and
 * the in-app purchase flow can never disagree.
 *
 * WHY THE ADD-ONS ARE STILL A GRID while the features section became a table:
 * the test from `01-REFERENCES.md §A.9` is *could a reader act on one row on its
 * own?* An add-on is a thing you buy by itself, so it is a catalogue item and a
 * grid is the honest shape for it. A feature row is evidence for a claim made
 * elsewhere, so it is prose. Same page, two shapes, one rule.
 *
 * SCOPE, since 2026-08-28: this component is the HOMEPAGE's pricing section
 * only. `/pricing` no longer renders it — that page has its own seven-shape
 * composition in `pricing-page.tsx` and borrows just the two calculators, so a
 * reader arriving from the nav is not met with a section they scrolled past on
 * the homepage. The `heading` prop is kept because it costs nothing and the
 * next caller who needs an `<h1>` should not have to re-derive it.
 */
export async function Pricing({
  heading = "h2",
  addons: showAddons = true,
}: { heading?: "h1" | "h2"; addons?: boolean } = {}) {
  const pricing = await getPublicPricing();
  const { addons } = pricing;
  const Heading = heading;

  return (
    <section id="pricing" className="slab settle lit lit-edge">
      <div className="container py-14 md:py-24">
        <Reveal inView className="max-w-3xl">
          <Heading className="display-m text-balance">
            Two products. Each priced by what it actually uses.
          </Heading>
        </Reveal>

        {/* What you can actually send TODAY, said before the calculator rather
            than after it. The tiers below describe where pricing lands as we
            open up; during the closed beta every account is held to a hard daily
            cap whatever plan it is on. Showing a calculator that runs to
            millions a month without this reads as a promise we are not currently
            keeping. The number comes from the API, which reads the same env the
            cap is enforced from, so the page cannot drift from the gate. */}
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

        {/* The two wings, sized honestly with the product's own math. */}
        <Reveal inView delay={0.05} className="mt-10 grid items-stretch gap-6 lg:grid-cols-2">
          <BlocksCalculator tx={pricing.wings.transactional} />
          <ContactPricer mk={pricing.wings.marketing} />
        </Reveal>

        {/* Add-ons — per one, buyable with a plan or entirely on their own.
            They are a catalogue (a reader can act on one row), so they stay a
            GRID — on `/pricing`, which is a catalogue. Inside the homepage's
            150-word section they are 260 words of description competing with
            the argument, so the homepage links to them instead. */}
        {showAddons ? (
        <Reveal inView delay={0.12} className="mt-14">
          <h3 className="display-s">Add-ons — priced per one, no plan required</h3>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Take one whether or not you&apos;re on a paid plan. Pick them at checkout (one bill) or
            buy them on their own — and buying more never re-bills what you already have.
          </p>
          <div className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {addons.map((a) => {
              const onSale = a.sale_price != null;
              return (
                <div key={a.id} className="flex h-full flex-col bg-background p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{a.name}</p>
                    {onSale ? (
                      <span className="shrink-0 font-mono text-[12px] text-acted" data-fact>
                        {a.sale_percent_off}% off
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-muted">
                    {a.description}
                  </p>
                  <p className="mt-3 font-mono text-sm" data-fact>
                    {onSale ? (
                      <>
                        <span className="font-semibold">${a.sale_price}</span>
                        <span className="ml-1 text-ink-muted line-through">${a.unit_amount}</span>
                      </>
                    ) : (
                      <span className="font-semibold">${a.unit_amount}</span>
                    )}
                    <span className="text-[12.5px] text-ink-muted">/mo per {a.unit}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>
        ) : null}

        {/* The billing promises, in one strip. */}
        <Reveal
          inView
          delay={0.16}
          className="mt-14 flex flex-col items-start justify-between gap-6 border-y border-rule py-7 sm:flex-row sm:items-center"
        >
          <div className="max-w-2xl">
            <p className="display-s">One bill. Never billed twice. Yearly is two months free.</p>
          </div>
          <CtaButton label="Start free" variant="outline" className="shrink-0 whitespace-nowrap" />
        </Reveal>

        <Reveal inView delay={0.2} className="mt-10">
          <p className="display-s">Every account includes</p>
          <ul className="mt-4 grid gap-x-10 font-mono text-[12.5px] text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
            {baseline.map((f) => (
              <li key={f} className="border-t border-rule py-2.5" data-fact>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            >
              {showAddons ? "Talk to us about committed volume" : "Add-ons, and the edges of the bill"}
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
