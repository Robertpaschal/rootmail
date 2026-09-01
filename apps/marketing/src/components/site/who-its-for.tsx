import Link from "next/link";

/**
 * "WHO IS THIS FOR?" — restored 2026-08-31, put on a rail 2026-09-01.
 *
 * A version of this section existed until the austerity pass deleted it with
 * the reasoning that *"a reader who needs to be told they are the audience is
 * not the audience"*. That is a clever sentence and it is wrong about how
 * people read a homepage: a stranger three sections in is not asking to be
 * flattered, they are asking whether the product was built for a business
 * shaped like theirs. The owner, reading the page without it: *"I am in the
 * fourth section and I still don't know what rootmail is about."* Naming the
 * shapes of business we built for is the cheapest answer there is.
 *
 * ── WHY IT IS A HORIZONTAL RAIL NOW (2026-09-01) ────────────────────────────
 * The owner: *"in Wispr Flow there is, in its testimonials, it scrolls in from
 * left to right as you scroll down — it whips in from left to right. I think we
 * can do that with 'who is it for' instead of having four boxes … we can even
 * do more [than four]."*
 *
 * Two things come out of that, and the second is the important one. The rig is
 * in `globals.css` under "THE HORIZONTAL RAIL", including what was measured on
 * wisprflow.ai before building it. But **"we can even do more"** is a content
 * note, not a layout note: a 2×2 grid of four boxes has an implicit claim in
 * it — *these four are the market* — and the closing paragraph underneath it
 * was busy apologising for that ("most senders are none of these — a school, a
 * two-person consultancy, a council office"). Those apologies are now cards.
 * Six shapes and an end-cap, and the section stops arguing with its own
 * footnote.
 *
 * ── WHY THE GROUND IS BRASS ─────────────────────────────────────────────────
 * The one brass band on the page, and this is the section that earns it: it is
 * the only one addressed to the reader in the second person. See "THE
 * ALTERNATION" in `globals.css` for why a brass SHEET does not break the rule
 * that brass means a control — in short, `.ground-brass` re-points `--primary`
 * and `--brass-text` off brass, so nothing inside can be brass and pressable
 * at the same time.
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
 * No client state and no script: a server component, complete at first paint,
 * whose cards are all in the SSR HTML whether the rail runs or not.
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
  {
    /* Was a clause in the old closing paragraph. It is a card because a school
       office reading "most senders are none of these" learns that we thought of
       them and did not build for them, which is the opposite of true. */
    who: "Schools, clubs and community groups",
    like: "a school office, a five-a-side league, a choir",
    story:
      "The term dates, the fixture change, the one email that has to reach every parent. Write it by dragging, send it to the list you already keep, and see what actually reached them. Nobody has to be the email person.",
  },
  {
    who: "Two-person teams and solo consultants",
    like: "a consultancy, a landlord, a freelancer with a list",
    story:
      "No developer, no email person, and no budget for either. The parts that normally need somebody watching them — bounces, unsubscribes, the DNS records behind your domain — watch themselves and tell you when something needs a decision.",
  },
];

export function WhoItsFor() {
  return (
    <section id="who" className="who-rig slab settle ground-brass lit-edge">
      <div className="who-pin py-14 md:py-20">
        <div className="container">
          <div className="max-w-2xl">
            <h2 className="display-m text-balance">Who it&apos;s for</h2>
            <p className="lead mt-5 text-ink-muted">
              If your business reaches people by email, it fits. These six are the ones we built
              for first, and the reason is different in every case.
            </p>
          </div>
        </div>

        {/* THE RAIL. Full-bleed on purpose — a belt that stops at the text
            measure reads as a carousel widget dropped into a column, and the
            whole point is that the section is wider than the page's reading
            width. The frame clips it; see `globals.css`. */}
        <div className="who-frame container lg:max-w-none lg:px-0">
          <ul className="who-track">
            {PERSONAS.map((p) => (
              <li
                key={p.who}
                className="who-card flex flex-col rounded-2xl bg-card p-6 shadow-e2 lg:min-h-[19rem]"
              >
                <h3 className="display-s text-balance">{p.who}</h3>
                <p className="mt-1.5 text-[13px] text-ink-muted">{p.like}</p>
                <p className="mt-4 flex-1 text-[0.9375rem] leading-relaxed text-ink-muted">
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
              </li>
            ))}

            {/* The end-cap. It used to be a paragraph under the grid saying
                "most senders are none of these", which read as a disclaimer.
                As the last card on the belt it is the arrival instead, and it
                is the only card carrying an ask. */}
            <li className="who-card flex flex-col justify-center rounded-2xl border border-dashed border-rule bg-well p-6 shadow-well lg:min-h-[19rem]">
              <h3 className="display-s text-balance">Not on this list?</h3>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">
                Most senders are none of the six — a council office sending twelve emails a week,
                a lab, a letting agent. It is the same product underneath, and the free plan is
                sized for exactly that.
              </p>
              <p className="mt-5">
                <Link
                  href="/pricing"
                  className="inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-4"
                >
                  See what it costs
                </Link>
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
