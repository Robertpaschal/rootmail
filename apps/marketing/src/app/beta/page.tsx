import type { Metadata } from "next";
import { Metric } from "@rootmail/design";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { betaStatus } from "@/lib/beta";
import { WaitlistForm } from "./waitlist-form";

const title = "Join the rootmail beta";
const description =
  "Every email your business sends — receipts and newsletters — finally in one place. rootmail is in closed beta — ask for an invite, and testers get everything unlocked.";

/**
 * The link we hand out.
 *
 * This is what goes in an X bio, a DM, a launch post — so the card is the
 * feature, not decoration: a bare rootmail.io/beta with no preview renders as a
 * grey rectangle nobody clicks. The image itself comes from the sibling
 * opengraph-image.tsx, which Next wires into these tags automatically.
 */
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "https://rootmail.io/beta" },
  openGraph: {
    type: "website",
    siteName: "rootmail",
    title,
    description,
    url: "https://rootmail.io/beta",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: true, follow: true },
};

/**
 * `/beta` — three shapes.
 *
 *  B1  bare page ground, type-led, and the seat count rendered as a REAL
 *      figure through `<Metric>`, which requires a window and a method by
 *      type. "12 of 40 places left" is the most consequential number on this
 *      page and it was set at 14px beside the rest of the prose; it is now the
 *      thing the eye lands on, and it carries where it came from
 *  B2  the ask: the form at 3fr against a 2fr ledger of what the deal is.
 *      Asymmetric on purpose — the form is the point of the page
 *  B3  one ruled row for the people who already hold a code
 *
 * WHAT THIS REPLACES: a centred badge over a centred heading over two centred
 * paragraphs, then three icon-and-text blocks in a right-hand column and a
 * bordered box. Centring everything is what a page does when it has not decided
 * what its one ask is.
 */
const PROMISES = [
  {
    title: "Everything unlocked",
    body: "Every feature on both wings. No plan, no card.",
    fact: "all features · no paywall · for the whole round",
  },
  {
    title: "You talk to a person",
    body: "Reply to any email we send and it reaches us, not a ticket queue.",
    fact: "reply-to · a human · not a queue",
  },
  {
    title: "Sending is capped",
    body: "Our email provider lifts the limits every new sender starts under. That is our constraint, not the product's.",
    fact: "daily cap · provider ramp · lifts as we send well",
  },
];

export default async function BetaPage() {
  const beta = await betaStatus();
  const full = beta.closed && !beta.accepting;

  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* ── B1 · bare ground, type-led, one real figure ─────────────────── */}
        <section className="container py-14 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <div>
              <h1 className="display-xl text-balance">Help us finish rootmail.</h1>
              <p className="lead mt-6 max-w-xl text-ink-muted">
                It works today, and it is early enough that what you say still changes it.
              </p>
            </div>

            <div className="lg:pb-2">
              {/* `seatsTotal === 0` is what `betaStatus()` returns when it could
                  not reach the API. A big `0` there would be a number we cannot
                  back, so the figure renders as an em dash with the method
                  saying why — the same thing an unknown station does on the
                  line, applied to a figure. */}
              {beta.seatsTotal === 0 ? (
                <Metric
                  value="—"
                  label="places left"
                  window="this round"
                  method="seat ledger unreachable"
                  size="lg"
                />
              ) : (
                <Metric
                  value={full ? 0 : beta.seatsLeft}
                  label="places left"
                  window="this round"
                  method="invite ledger"
                  size="lg"
                  threshold={`of ${beta.seatsTotal}`}
                />
              )}
              <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-ink-muted">
                {full
                  ? "Every place in this round is taken. Add yourself and you are first to hear when the next one opens."
                  : "We invite in small batches so the people inside get real attention."}
              </p>
            </div>
          </div>
        </section>

        {/* ── B2 · the ask, weighted toward the form ──────────────────────── */}
        <section className="slab settle lit lit-edge">
          <div className="container py-12 md:py-16">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
              <WaitlistForm />

              <div>
                <p className="border-b border-rule pb-2.5 font-mono text-[11px] uppercase tracking-wide text-ink-muted" data-fact>
                  what being a tester means
                </p>
                <div className="ruled">
                  {PROMISES.map((p) => (
                    <div key={p.title} className="py-4">
                      <h2 className="display-s">{p.title}</h2>
                      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
                        {p.body}
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-ink-muted" data-fact>
                        {p.fact}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── B3 · one ruled row ─────────────────────────────────────────── */}
        <section className="container py-12 md:py-16">
          <p className="border-y border-rule py-6 text-[0.9375rem] text-ink-muted">
            Already have an invite code?{" "}
            <a
              href="https://app.rootmail.io/signup"
              className="font-medium text-brass-text underline underline-offset-4"
            >
              Create your account
            </a>
            .
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
