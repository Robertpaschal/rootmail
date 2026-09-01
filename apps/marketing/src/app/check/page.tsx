import type { Metadata } from "next";
import Link from "next/link";
import { Line, type Station } from "@rootmail/design";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { DomainCheck } from "./domain-check";
import { LIMITS } from "./rate-limit";

/**
 * `/check` — the signature toy. Spec: `docs/design/04-EXPERIENCE.md` §6.
 *
 * This file is the page: a heading, the form (`DomainCheck`), and the static
 * argument underneath it. The lookup engine is `audit.ts`, the status → drawing
 * mapping is `render.ts`, and the JSON twin is `../api/check/route.ts`.
 *
 * LAW 1 — motion never makes content visible.
 * Everything on this page except `<DomainCheck>`'s own form state is a server
 * component. There is no `Reveal`, no `inView`, no opacity transition and no
 * timer anywhere in this tree, deliberately: the rest of the site can afford a
 * 700ms entrance, but this is the page whose entire claim is "what is really
 * there, right now", and a page that argues that cannot be a page you have to
 * wait for. With JavaScript disabled the heading, the form, the empty dotted
 * line, the four mechanism definitions, the legend and the whole argument below
 * are all present — and the form still works, because it posts to a server
 * action rather than to a `fetch`. Kill the script and read it: nothing is
 * missing but the word `looking…` on the button.
 *
 * LAW 2 — `prefers-reduced-motion` reaches the same information.
 * There is no animated route to any information here, so there is nothing to
 * skip. The one transition in the tree is the shared `.line-state` stroke
 * colour ease (`packages/design/tokens.css`), on geometry that is always
 * complete — and `tokens.css` already sets `transition: none` under
 * `prefers-reduced-motion`. A frozen frame is a readable frame either way.
 *
 * LAW 3 — the rendering law. Owned by `render.ts`, and stated ON THE PAGE in
 * `HowToRead` below, because a rendering law nobody can read is just an
 * inconsistency.
 */

export const metadata: Metadata = {
  title: "Check a domain",
  description:
    "Type your domain. We read what public DNS actually says about your SPF, DKIM, DMARC and BIMI, show you the records verbatim, and tell you the second we looked. A DMARC record at p=none is published and doing nothing — every other checker draws that as a green tick, and we draw it as what it is. We do not send anything and we do not store your domain.",
  // The result is not addressable — §6.4 forbids a permalink containing
  // somebody's domain, because that would make us a public directory of other
  // people's DNS posture. So `/check` is the only URL, and it is the one indexed.
  alternates: { canonical: "/check" },
};

/**
 * The worked example, drawn at rest, with no lookup and no script.
 *
 * This is the thesis (§6.2) and it has to be legible before the visitor types
 * anything: the node is solid because the record is REAL — we read it — and the
 * segment leaving it is dashed because the record is doing NOTHING. Publication
 * and protection are two different claims and only one of them is true.
 */
const ARGUMENT_STATIONS: Station[] = [
  { label: "DMARC published", state: "witnessed" },
  { label: "mail protected", state: "unknown" },
];

const REFUSALS: Array<{ term: string; body: string }> = [
  {
    term: "We do not send anything.",
    body:
      "Not a test message, not a verification email, nothing. This reads public DNS and that is the entire extent of it. You typed a domain into an email company's input box; you are owed that sentence before you have to ask for it.",
  },
  {
    term: "We do not store your domain.",
    body:
      "It is not written to a log, a cookie, a session or an analytics event. It exists for the length of one request and goes back to you. The rate limit counts lookups against a salted hash of your address and never sees the domain at all.",
  },
  {
    term: "There is no permalink.",
    body:
      "The result has no URL of its own, and the answer travels in the body of a POST rather than a query string so it never lands in an access log or a referrer. Screenshot it — that is the sharing mechanism. A shareable link would make us a public directory of other people's DNS posture, which is a different and worse product.",
  },
  {
    term: "This is a live resolver, always.",
    body:
      "rootmail ships a mock DNS mode for local development, and this page cannot reach it: the lookups here are written against a real resolver directly and no environment variable can turn them into a simulation. A mock rendering as a result would be exactly the lie this page exists to refuse.",
  },
  {
    term: "“We could not look” is never drawn as “you have no record”.",
    body:
      "A resolver that fails is a fact about our lookup, not a fact about your DNS. A failed query renders as a severed line that says so; only a resolver that positively answered “there is nothing published at that name” is allowed to render as not-found.",
  },
];

export default function CheckPage() {
  return (
    <>
      <Navbar />
      {/* THE SAME GUTTER THE HOME PAGE USES, so this page's sections are the
          same objects as that page's — inset plates on a ground rather than
          full-bleed slices divided by a hairline. `<main>` had no padding and
          each section was `border-b border-rule`, which is precisely the flat
          composition the home page was rebuilt out of; this page never got the
          pass. See `.slab` in `globals.css`. */}
      <main className="px-3 pb-4 sm:px-5">
        <section className="slab settle lit">
          <div className="container py-14 md:py-20">
            <div className="max-w-2xl">
              <p className="font-mono text-[12.5px] uppercase tracking-heading text-ink-muted">
                public DNS · nothing sent · nothing stored
              </p>
              <h1 className="display-l mt-4 text-balance">
                What does the internet actually say about your email?
              </h1>
              <p className="lead mt-5 text-ink-muted">
                Type your domain. We look up what public DNS really publishes about it, draw
                the answer under the same rendering law we use in production, show you the
                records verbatim, and tell you the second we looked.
              </p>
            </div>

            <div className="mt-10 max-w-3xl">
              <DomainCheck />
            </div>
          </div>
        </section>

        <HowToRead />
        <Refusals />
      </main>
      <Footer />
    </>
  );
}

/* ------------------------------------------------------------- the law, read */

/**
 * The rendering law, on the page, with the `weak` case argued rather than
 * asserted. Server-rendered; no script reaches it.
 */
function HowToRead() {
  return (
    /* INVERTED, and not only for rhythm. This section is the rendering law
       itself — the one claim the whole product rests on — and on the home page
       that argument is carried on an ink band too. The alternation rule from
       the home page applies: no two adjacent sections on the same ground, and
       the seam here measures ~16:1. */
    <section id="how-to-read" className="slab settle ground-ink lit-edge">
      <div className="container py-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="display-m text-balance">
              A published record and a protected domain are two different claims.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-muted">
              A DMARC record that reads <code className="font-mono text-[13px]">p=none</code> is
              published — we read it, so we draw its node solid — and it asks receivers to do
              nothing about mail that fails. Every other checker in this category renders that
              as a green tick, because a record exists. We draw the segment leaving it dashed,
              because the protection does not.
            </p>

            <div className="mt-8 overflow-x-auto pb-1">
              <Line
                scale="page"
                stations={ARGUMENT_STATIONS}
                label="DMARC published: witnessed. Mail protected: unknown — the segment between them is dashed."
              />
            </div>
            <p className="mt-3 font-mono text-[12.5px] leading-relaxed text-muted-foreground">
              v=DMARC1; p=none; rua=mailto:…
              <br />
              published · not protecting anything
            </p>
          </div>

          <div>
            <h3 className="text-[12.5px] uppercase tracking-heading text-ink-muted">
              The four states, and what each one is a claim about
            </h3>
            <dl className="ruled mt-4 border-y border-rule">
              {(
                [
                  [
                    "witnessed",
                    "solid",
                    "We queried the name, the resolver answered, and the record says what it needs to say. We saw it.",
                  ],
                  [
                    "inferred",
                    "hollow",
                    "We derived it rather than observed it. Nothing on this page is inferred — DNS either answered or it did not — but the state is drawn in the legend because the law is one law everywhere.",
                  ],
                  [
                    "unknown",
                    "dotted",
                    "We looked and found nothing, or we have not looked yet. The resting state of this page is entirely dotted for that reason.",
                  ],
                  [
                    "stopped",
                    "severed",
                    "It ends here and the reason is printed beside it: a mechanism blocked by a precondition, a domain that does not exist, or a resolver that would not answer.",
                  ],
                ] as const
              ).map(([state, drawing, body]) => (
                <div key={state} className="grid grid-cols-[6.5rem_1fr] gap-x-4 py-3.5">
                  <dt className="font-mono text-[13px]">
                    {state}
                    <span className="block text-[12.5px] text-muted-foreground">{drawing}</span>
                  </dt>
                  <dd className="text-sm leading-relaxed text-ink-muted">{body}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
            </div>
            <p className="mt-6 max-w-prose text-sm leading-relaxed text-ink-muted">
              It is the same rule inside the product. An open is a tracking pixel firing, so an{" "}
              <span className="font-mono text-[13px]">opened</span> station renders hollow on
              every message in the dashboard, forever. We never draw a solid line through
              something we did not observe —{" "}
              <Link
                href="/about"
                className="underline decoration-rule underline-offset-4 hover:text-foreground"
              >
                which is most of what rootmail is
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- the refusals */

function Refusals() {
  return (
    /* Linen, so the close is neither the paper it opened on nor a second ink
       band against the one above it. */
    <section className="slab settle ground-linen">
      <div className="container py-14 md:py-20">
        <h2 className="display-m max-w-2xl text-balance">What this page will not do</h2>
        <dl className="ruled mt-8 max-w-3xl border-y border-rule">
          {REFUSALS.map((r) => (
            <div key={r.term} className="py-4">
              <dt className="text-[15px] font-medium">{r.term}</dt>
              <dd className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
                {r.body}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 max-w-prose font-mono text-[12.5px] leading-relaxed text-muted-foreground">
          {LIMITS.perIp} lookups an hour from one address, {LIMITS.global} an hour across
          everyone · each lookup gets 3 seconds and then we say we do not know
          <br />
          the same answer as JSON: <code>POST /api/check</code> with{" "}
          <code>{'{"domain":"yourcompany.com"}'}</code> — it refuses GET so the domain never
          lands in a URL
        </p>
      </div>
    </section>
  );
}
