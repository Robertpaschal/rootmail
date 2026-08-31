/**
 * "WHO IS THIS FOR?" — restored, 2026-08-31.
 *
 * A version of this section existed until the austerity pass deleted it with
 * the reasoning that *"a reader who needs to be told they are the audience is
 * not the audience"*. That is a clever sentence and it is wrong about how
 * people read a homepage: a stranger three sections in is not asking to be
 * flattered, they are asking whether the product was built for a business
 * shaped like theirs. The owner, reading the page without it: *"I am in the
 * fourth section and I still don't know what rootmail is about."* Naming the
 * four shapes of business we built for is the cheapest answer there is.
 *
 * ── WHAT IS DIFFERENT FROM THE OLD ONE (`77c4fe2`) ──────────────────────────
 * The old section led with brands and shops and buried the platform case in a
 * card called "People building products". `docs/COLLAB.md` settled who the
 * buyer actually is — vertical SaaS and agencies that send on behalf of their
 * own customers — so that case leads now, in their own words rather than ours.
 * The rest stays, because the product genuinely serves them and the audience
 * doctrine (no-code first, transcending to developers) has not changed.
 *
 * ── THE HONESTY GUARD ───────────────────────────────────────────────────────
 * These are shapes of business, not customers. No company is named, no logo is
 * shown, no count is implied — we are in closed beta and a persona card is the
 * easiest place on a marketing site to imply traction by accident.
 *
 * The isolation sentence is the one to watch here. We may say each client is
 * scored, throttled and stopped separately, because that shipped in `d2c64ab`.
 * We may NOT say one client's mistake cannot reach another's delivery: they
 * share an IP pool and a provider account, and the section below this one draws
 * exactly that. So this card says what we DO — measure each one, and stop the
 * one going wrong before it costs you the rest.
 *
 * No client state, no motion: a server component that is complete at first
 * paint.
 */

type Persona = {
  who: string;
  /** The concrete example, so "vertical SaaS" is never the only clue. */
  like: string;
  story: string;
  href?: string;
  cta?: string;
};

const PERSONAS: Persona[] = [
  {
    who: "Software that emails on behalf of its customers",
    like: "booking software, a CRM, a clinic system, a marketplace",
    story:
      "Every one of your customers sends from their own web address, with their own contacts, their own bounces and their own score. When one of them uploads a list they should not have, rootmail warns you, slows that customer down, and then stops them — before it costs you the rest.",
  },
  {
    who: "Agencies sending for clients",
    like: "a studio running email for a dozen businesses",
    story:
      "Run every client from one login, and switch into a client to see only their work. Each keeps their own domain, their own list and their own history, so handing an account back at the end of a contract is a handover, not an excavation.",
  },
  {
    who: "Shops, brands and publishers",
    like: "a clothing label, a gym, a morning newsletter",
    story:
      "Announce the new drop to your customers and let your website send its own order confirmations. Design everything by dragging, with no code and no developer. Replies come back to a shared inbox, and new subscribers get a welcome series that sends itself.",
  },
  {
    who: "People building products",
    like: "a developer, or a two-person team with one",
    story:
      "Stop hand-rolling email inside every backend. One API key and a POST; retries never double-send. Templates, sequences and domains stay editable in the dashboard afterwards — by you, or by the client you built it for.",
    href: "https://developers.rootmail.io",
    cta: "The developer pitch",
  },
];

export function WhoItsFor() {
  return (
    <section id="who" className="slab settle lit lit-edge">
      <div className="container py-14 md:py-24">
        <div className="max-w-2xl">
          <h2 className="display-m text-balance">Who it&apos;s for</h2>
          <p className="lead mt-5 text-ink-muted">
            If your business reaches people by email, it fits. These four are the ones we built for
            first, and the reasons are different in each case.
          </p>
        </div>

        {/* The tray, with the four cases lifted out of it — the same
            tray-and-lift vocabulary as the deck, the ladder and the pricing
            meters, so this reads as part of one page. */}
        <div className="mt-10 grid gap-2 rounded-2xl bg-well p-2 shadow-well sm:p-3 lg:grid-cols-2">
          {PERSONAS.map((p) => (
            <div key={p.who} className="flex h-full flex-col rounded-xl bg-card p-5 shadow-e1">
              <h3 className="display-s text-balance">{p.who}</h3>
              <p className="mt-1.5 text-[13px] text-ink-muted">{p.like}</p>
              <p className="mt-3 flex-1 text-[0.9375rem] leading-relaxed text-ink-muted">
                {p.story}
              </p>
              {p.href ? (
                <p className="mt-4">
                  <a
                    href={p.href}
                    className="inline-flex min-h-11 items-center text-[13px] font-medium text-brass-text underline-offset-4 hover:underline"
                  >
                    {p.cta}
                  </a>
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
          Most senders are none of these — a school, a two-person consultancy, a council office
          sending twelve emails a week. It is the same product underneath, and the free plan is
          sized for exactly that.
        </p>
      </div>
    </section>
  );
}
