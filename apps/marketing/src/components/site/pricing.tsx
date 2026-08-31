import Link from "next/link";
import { getPublicPricing } from "@/lib/pricing";
import { Reveal } from "./motion";
import { CtaButton } from "./cta-button";
import { BlocksCalculator, ContactPricer } from "./pricing-calculators";

// The floor every account shares — so the two wings are about what THEY do,
// not table stakes.
const baseline = [
  "a drag-and-drop editor, no code needed",
  "an AI assistant that builds and diagnoses",
  "one shared inbox for every reply",
  "reputation score, do-not-send list, webhooks",
  "signed records anyone can check",
  "the API, the SDKs and the docs",
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
            You pay for two things. Everything else is included.
          </Heading>
          {/* THE OWNER, ON THE OLD HEADING: *"'two products each priced by what
              it's actually worth' — are you marketing two products? I am not
              motivated to purchase anything because I don't even know what
              you're trying to sell to me."* Fair. rootmail is ONE account; what
              is split in two is the METER, and saying "two products" invited a
              reader to go looking for the second product and the second login.
              This says what is metered and, more importantly, what is not. */}
          <p className="lead mt-5 text-ink-muted">
            How many emails you send, and how many contacts you keep. They are billed separately,
            so if you only ever send receipts you never pay for a contact list, and if you only
            send a newsletter you are not paying per send.
          </p>
          <p className="mt-5 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
            Everything else is on every plan, the free one included: the drag-and-drop editor, the
            shared reply inbox, the AI assistant, per-client scoring, signed records, the API. We
            charge for volume, never for features.
          </p>
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
              rootmail is in closed beta, so every account is capped at{" "}
              <span className="font-mono" data-fact>
                {pricing.beta.daily_send_cap}
              </span>{" "}
              sends a day right now
            </p>
          </div>
        ) : null}

        {/* The two wings, sized honestly with the product's own math.
            THE TRAY IS NOT DECORATION. Both meters are `bg-card`, and a `.slab`
            is also painted `hsl(var(--card))` — measured on the built page they
            came back rgb(254,253,251) on rgb(254,253,251), a contrast ratio of
            1.00 against the thing they sat on, in both themes. That is the
            whole of "it still feels flat": there was one plane pretending to be
            three. The pressed tray gives the cards something to be lifted out
            of, which is what `--well` exists for. */}
        <Reveal inView delay={0.05} className="mt-10">
          <div className="rounded-2xl bg-well p-3 shadow-well sm:p-4">
            <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-2">
              <BlocksCalculator tx={pricing.wings.transactional} />
              <ContactPricer mk={pricing.wings.marketing} />
            </div>
          </div>
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
          {/* A tray with the catalogue lifted out of it, rather than a
              hairline mesh painted in `--rule`. Same reason as the block
              below: an item a reader can buy on its own should sit up off the
              page, not be a cell in a grille. */}
          <div className="mt-6 grid gap-2 rounded-2xl bg-well p-2 shadow-well sm:grid-cols-2 sm:p-3 lg:grid-cols-3">
            {addons.map((a) => {
              const onSale = a.sale_price != null;
              return (
                <div key={a.id} className="flex h-full flex-col rounded-xl bg-card p-4 shadow-e1">
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
                  <p className="mt-3 flex items-baseline gap-1.5">
                    {onSale ? (
                      <>
                        <span className={`display-num text-xl leading-none`} data-fact>
                          ${a.sale_price}
                        </span>
                        <span className="font-mono text-[12.5px] text-ink-muted line-through">
                          ${a.unit_amount}
                        </span>
                      </>
                    ) : (
                      <span className={`display-num text-xl leading-none`} data-fact>
                        ${a.unit_amount}
                      </span>
                    )}
                    <span className="font-mono text-[12.5px] text-ink-muted">/mo per {a.unit}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>
        ) : null}

        {/* ─── THE BILLING CALLOUT ───────────────────────────────────────
            The owner: *"just before the pricing where you say 'yearly is two
            months free' — that is supposed to be a CTA. We can design that
            particular callout to stand out so somebody wants to click it."*

            It was a `border-y` strip: two hairlines, a 1.125rem line of text,
            and an OUTLINE button — the lowest-weight button on the page, on
            the one row that is asking for the sale. It is a brass panel now,
            lifted out of the section on `e2`, and the button is primary.

            Brass is the correct colour by the system's own rule and not just
            because it is warm: `tokens.css` reserves brass for **what you can
            act on**, and the signal colours for what happened to a message. A
            panel whose entire job is to be pressed is the definition of the
            first. It is also the only brass SURFACE on the homepage, which is
            what makes it the one thing on a long page that reads as an offer.

            The saving is stated as a figure, not as a bare adjective, and the
            three promises stay: one bill, never billed twice, and the yearly
            terms — none of them is dropped to make the panel tidier. */}
        <Reveal inView delay={0.16} className="mt-14">
          <div className="overflow-hidden rounded-2xl border border-brass-rule bg-brass-tint shadow-e2">
            <div className="flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="max-w-xl">
                <p className="display-m text-balance">Pay yearly, get two months free.</p>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                  One bill for everything — both meters and any extras. Buying more capacity part
                  way through a month never re-bills what you have already paid for.
                </p>
              </div>
              <CtaButton
                label="Start free"
                size="lg"
                arrow
                className="shrink-0 whitespace-nowrap"
              />
            </div>
          </div>
        </Reveal>

        {/* ─── EVERY ACCOUNT INCLUDES ────────────────────────────────────
            *"'every account includes' and the add-ons — those two places can
            be made more pronounced and better."*

            Two things were wrong and one of them was a rule violation. The
            six items were set in 12.5px MONO, and `00-PHILOSOPHY.md` §10.1 is
            explicit that mono marks ids, timestamps and sourcing lines — a
            recorded value. "AI assistant" is not a recorded value; setting it
            in the ledger face told the reader it was one, in the smallest type
            on the page. They are in the UI face at 14px now.

            The second was weight: six hairline rows under a `display-s` were
            the quietest block in the section, sitting directly under the loudest
            one. It is a pressed tray with six cards in it now — the same
            tray-and-lift vocabulary as the meters above it, so the floor every
            account shares reads as a floor rather than as a footnote. */}
        <Reveal inView delay={0.2} className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="display-s">Every account includes</h3>
            <p className="text-[13px] text-ink-muted">
              on the free plan too — you pay for volume, never for features
            </p>
          </div>
          <ul className="mt-4 grid gap-2 rounded-2xl bg-well p-2 shadow-well sm:grid-cols-2 sm:p-3 lg:grid-cols-3">
            {baseline.map((f) => (
              <li key={f} className="rounded-xl bg-card px-4 py-3 text-sm shadow-e1">
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
            >
              {showAddons
                ? "Talk to us about committed volume"
                : "See the full pricing, add-ons and all"}
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
