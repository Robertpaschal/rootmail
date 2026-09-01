import Link from "next/link";
import {
  Boxes,
  Briefcase,
  CircleHelp,
  Handshake,
  Store,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * "WHO IS THIS FOR?" — restored 2026-08-31, put on a rail 2026-09-01, and on a
 * DECK later the same day.
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
 * ── WHY IT IS A DECK NOW, AND NOT THE RAIL IT WAS THIS MORNING ─────────────
 * The rail put six 17rem cards on a belt that whipped left. The owner, seeing
 * it: *"we don't have to show so many at once … we would have a box on the
 * left of that box, and you would have an icon image. On the right of that
 * box, you have, for example, 'Software that emails on behalf of its
 * customers'. The sub-description beneath it. It's a whole first, large, very
 * large card. You have the second one almost visible, and as you are
 * scrolling, it is revealing itself."*
 *
 * The belt is gone rather than kept alongside. The two are the same idea at
 * two densities and only one of them can be right: a belt asks the reader to
 * choose among six things at once, and the owner's note is that exactly one
 * persona should be asking for attention at a time. The rig, the reference it
 * was measured from and the four ways it degrades are in `globals.css` under
 * "THE DECK".
 *
 * **The content did not change.** Same six shapes, same end-cap, same words —
 * this was a presentation change and nothing in it is a new claim. The only
 * copy that MOVED is the lead's first sentence, promoted to the display line
 * so the heading is the centred, bold statement the owner asked for; the
 * section name carries on above it as the eyebrow. Nothing was written for it.
 *
 * ── WHY THE GROUND IS STILL BRASS ──────────────────────────────────────────
 * The one brass band on the page, and this is the section that earns it: it is
 * the only one addressed to the reader in the second person. See "THE
 * ALTERNATION" in `globals.css` for why a brass SHEET does not break the rule
 * that brass means a control — in short, `.ground-brass` re-points `--primary`
 * and `--brass-text` off brass, so nothing inside can be brass and pressable
 * at the same time. That is also what makes the card icons safe in
 * `--brass-text` here: inside this band it is cut to a deep umber, not to a
 * control's colour.
 *
 * ── THE HONESTY GUARD ──────────────────────────────────────────────────────
 * These are shapes of business, not customers. No company is named, no logo is
 * shown, no count is implied — we are in closed beta and a persona card is the
 * easiest place on a marketing site to imply traction by accident. The icons
 * are lucide line marks for the KIND of business, never a photograph and never
 * a screenshot of something nobody can sign into yet.
 *
 * The isolation sentence is the one to watch here. We may say each client is
 * scored, throttled and stopped separately, because that shipped in `d2c64ab`.
 * We may NOT say one client's mistake cannot reach another's delivery: they
 * share an IP pool and a provider account, and the section below this one draws
 * exactly that. So this card says what we DO — measure each one, and stop the
 * one going wrong before it costs you the rest.
 *
 * No client state and no script: a server component, complete at first paint.
 * Every card, heading and sub-description is in the SSR HTML whether the deck
 * runs or not, and no card is ever `opacity: 0` in any state — so with
 * JavaScript disabled and every frame and timer dead this section is a plain
 * list of seven cards, in order, entire.
 */

type Persona = {
  who: string;
  /** The concrete example, so "vertical SaaS" is never the only clue. */
  like: string;
  story: string;
  icon: LucideIcon;
  href?: string;
  cta?: string;
};

const PERSONAS: Persona[] = [
  {
    who: "Software that emails on behalf of its customers",
    like: "booking software, a CRM, a clinic system, a marketplace",
    icon: Boxes,
    story:
      "Every one of your customers sends from their own web address, with their own contacts, their own bounces and their own score. When one of them uploads a list they should not have, rootmail warns you, slows that customer down, and then stops them — before it costs you the rest.",
  },
  {
    who: "Agencies sending for clients",
    like: "a studio running email for a dozen businesses",
    icon: Briefcase,
    story:
      "Run every client from one login, and switch into a client to see only their work. Each keeps their own domain, their own list and their own history, so handing an account back at the end of a contract is a handover, not an excavation.",
  },
  {
    who: "Shops, brands and publishers",
    like: "a clothing label, a gym, a morning newsletter",
    icon: Store,
    story:
      "Announce the new drop to your customers and let your website send its own order confirmations. Design everything by dragging, with no code and no developer. Replies come back to a shared inbox, and new subscribers get a welcome series that sends itself.",
  },
  {
    who: "People building products",
    like: "a developer, or a two-person team with one",
    icon: Terminal,
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
    icon: Users,
    story:
      "The term dates, the fixture change, the one email that has to reach every parent. Write it by dragging, send it to the list you already keep, and see what actually reached them. Nobody has to be the email person.",
  },
  {
    who: "Two-person teams and solo consultants",
    like: "a consultancy, a landlord, a freelancer with a list",
    icon: Handshake,
    story:
      "No developer, no email person, and no budget for either. The parts that normally need somebody watching them — bounces, unsubscribes, the DNS records behind your domain — watch themselves and tell you when something needs a decision.",
  },
];

/** Six shapes plus the end-cap. The deck's scroll budget derives from it. */
const COUNT = PERSONAS.length + 1;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function WhoItsFor() {
  return (
    <section
      id="who"
      className="deck-rig slab settle ground-brass lit-edge"
      style={{ "--deck-steps": COUNT - 1 } as React.CSSProperties}
    >
      <div className="deck-pin">
        <div className="container text-center">
          <p className="deck-eyebrow">Who it&apos;s for</p>
          <h2 className="display-l mx-auto mt-4 max-w-3xl text-balance">
            If your business reaches people by email, it fits.
          </h2>
          <p className="lead mx-auto mt-4 max-w-xl text-ink-muted">
            These six are the ones we built for first, and the reason is different in every case.
          </p>
        </div>

        <ol className="deck-stage container">
          {PERSONAS.map((p, i) => {
            const Icon = p.icon;
            return (
              <li key={p.who} className="deck-card" style={{ "--i": i } as React.CSSProperties}>
                <article className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-e2 sm:flex-row sm:items-stretch sm:gap-7 sm:p-8">
                  {/* The box on the left. It is a well pressed INTO the card
                      rather than a second raised plane — one lift per card, so
                      the deck never has to argue with itself about which plane
                      is on top while four of them are on screen at once. */}
                  <div className="flex shrink-0 items-center justify-between gap-5 rounded-xl bg-well p-4 shadow-well sm:w-52 sm:flex-col sm:items-start sm:p-5">
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.25}
                      className="h-9 w-9 text-brass-text sm:h-12 sm:w-12"
                    />
                    <span className="font-mono text-[12px] tracking-wide text-ink-muted">
                      {pad(i + 1)} / {pad(COUNT)}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <h3 className="display-m text-balance">{p.who}</h3>
                    <p className="mt-2 text-[0.875rem] text-ink-muted">{p.like}</p>
                    <p className="mt-4 max-w-[46ch] text-[1rem] leading-relaxed text-ink-muted">
                      {p.story}
                    </p>
                    {p.href ? (
                      <p className="mt-5">
                        <a
                          href={p.href}
                          className="inline-flex min-h-11 items-center text-[13px] font-medium text-brass-text underline-offset-4 hover:underline"
                        >
                          {p.cta}
                        </a>
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}

          {/* The end-cap. It used to be a paragraph under the grid saying
              "most senders are none of these", which read as a disclaimer. As
              the last card of the deck it is the arrival instead, and it is the
              only card carrying an ask. */}
          <li className="deck-card" style={{ "--i": PERSONAS.length } as React.CSSProperties}>
            <article className="flex h-full flex-col gap-5 rounded-2xl border border-dashed border-rule bg-well p-6 shadow-well sm:flex-row sm:items-stretch sm:gap-7 sm:p-8">
              <div className="flex shrink-0 items-center justify-between gap-5 rounded-xl border border-dashed border-rule p-4 sm:w-52 sm:flex-col sm:items-start sm:p-5">
                <CircleHelp
                  aria-hidden="true"
                  strokeWidth={1.25}
                  className="h-9 w-9 text-ink-muted sm:h-12 sm:w-12"
                />
                <span className="font-mono text-[12px] tracking-wide text-ink-muted">
                  {pad(COUNT)} / {pad(COUNT)}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <h3 className="display-m text-balance">Not on this list?</h3>
                <p className="mt-4 max-w-[46ch] text-[1rem] leading-relaxed text-ink-muted">
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
              </div>
            </article>
          </li>
        </ol>
      </div>
    </section>
  );
}
