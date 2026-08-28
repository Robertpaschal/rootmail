import { Reveal } from "./motion";

/**
 * `/pricing` used to be `<Pricing/>` + `<Cta/>` — literally the same two
 * components as homepage positions 9 and 11 — which meant the page rendered
 * ZERO `<h1>` elements, opened with the same eyebrow badge the reader had just
 * scrolled past nine times, and closed with the same dark slab they had already
 * seen once in the session.
 *
 * This is the page's own argument, and it is the one the philosophy names: the
 * incumbent charges for the thing we treat as part of the data model. Every
 * figure below is either ours (from the live catalog, via `Pricing`) or a
 * published competitor gate, and the three rows say what happens at the edges —
 * which is the only part of a price list anybody actually worries about.
 */
const edges = [
  {
    q: "What happens when I go over?",
    a: "Sending does not stop. Transactional overage is billed per 1,000 past your blocks. The free tiers pause at their cap instead of charging you, so you can never be surprised by a bill you did not choose.",
    fact: "overage · per 1,000 · sending continues",
  },
  {
    q: "What does sending for my clients cost?",
    a: "Nothing extra. Client domains are part of the data model rather than a plan you have to reach — each client gets their own sending domain, signing keys, suppression list and score on any plan, including the free one. Mailgun gates subaccounts behind its Scale plan at $90 a month minimum.",
    fact: "client domains · included · no tier gate",
  },
  {
    q: "What if I only need one half?",
    a: "Then pay for one half. The two wings bill independently: transactional is priced by send volume, marketing by audience size, and being free on one side does not affect the other. Most email companies make you buy the bundle, or make you buy two of them from two vendors.",
    fact: "two bills · either one can be $0",
  },
];

export function PricingArgument() {
  return (
    <section className="border-b border-rule">
      <div className="container py-14 md:py-24">
        <Reveal className="max-w-3xl">
          <h1 className="display-xl text-balance">You pay for volume, not for permission.</h1>
          <p className="lead mt-6 max-w-2xl text-ink-muted">
            Two things this page will not do: quote a price that is not the price you get charged,
            and hide the ceiling. The calculators below run the same block and per-contact maths the
            product bills on, and they read the live catalog — so a number here and a number at
            checkout cannot disagree.
          </p>
        </Reveal>

        <div className="ruled mt-12 border-y border-rule">
          {edges.map((e, i) => (
            <Reveal key={e.q} inView delay={0.04 * i}>
              <div className="grid gap-x-10 gap-y-2 py-7 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
                <h2 className="display-s text-balance">{e.q}</h2>
                <div>
                  <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">{e.a}</p>
                  <p className="mt-2.5 font-mono text-[11px] text-ink-muted" data-fact>
                    {e.fact}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
