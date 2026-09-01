import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { cn } from "@/lib/utils";
import { ContactForm } from "./contact-form";

const ENTERPRISE_PERKS = [
  "committed-use volume · deepest overage discounts",
  "SSO / SAML · SCIM provisioning",
  "EU data residency · signed DPA",
  "dedicated IPs · managed warming",
  "AI credits · unlimited",
  "a named contact · an uptime SLA",
];

// Each entry point lands on the right intent. `source` tags the lead so the team can
// triage by reason; `full` shows the sales/enterprise qualifying fields.
const TOPICS = {
  general: {
    label: "General",
    title: "Let’s talk.",
    blurb:
      "A question, some feedback, or hello. Tell us what is on your mind and we will get back to you.",
    fact: "routes to · the team · usually within one business day",
    cta: "Send message",
    source: "contact_general",
    full: false,
  },
  sales: {
    label: "Sales",
    title: "Find the right plan.",
    blurb:
      "Planning a migration, or scaling up? Tell us the use case and the volume and we will land you on the right plan.",
    fact: "routes to · sales · overage · sub-tenancy · seats",
    cta: "Talk to sales",
    source: "contact_sales",
    full: true,
  },
  enterprise: {
    label: "Enterprise",
    title: "A custom enterprise plan.",
    blurb: "Tell us your requirements and we will scope it with you.",
    fact: "routes to · sales · scoped, then quoted",
    cta: "Contact sales",
    source: "contact_enterprise",
    full: true,
  },
  support: {
    label: "Support",
    title: "Get a hand.",
    blurb:
      "Describe what is happening and we will help. Signed in already? The in-app assistant can often diagnose it faster than we can.",
    fact: "routes to · support · assistant diagnoses in-app",
    cta: "Get help",
    source: "contact_support",
    full: false,
  },
} as const;

type TopicKey = keyof typeof TOPICS;
const isTopic = (v: string | undefined): v is TopicKey => v != null && v in TOPICS;
const hrefFor = (k: TopicKey) => (k === "general" ? "/contact" : `/contact?topic=${k}`);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}): Promise<Metadata> {
  const { topic } = await searchParams;
  const t = TOPICS[isTopic(topic) ? topic : "general"];
  return { title: t.label === "General" ? "Contact" : t.label, description: t.blurb };
}

/**
 * `/contact` — one shape, and it is the right one, so the work here was making
 * it commit.
 *
 * The page's verb is SWITCH: four intents over one form, chosen with real links
 * so the choice survives a page load, a bookmark and a browser with no
 * JavaScript. That is the whole composition and nothing else on the site uses
 * it, which is why the tab strip stays.
 *
 * What changed is everything around it. The left column is now a STICKY RAIL —
 * one thing (who you are writing to, and what happens next) held still against
 * a form that scrolls past it, which is the one place on the site where sticky
 * is honest because the rail is context for the thing beside it rather than
 * content of its own. The `<Badge>` eyebrow is gone; the routing line under the
 * blurb says the same thing as a fact instead of as a label. The enterprise
 * list was six check-marks in tinted circles and is now six mono rows, because
 * the checkmark asserted nothing the words did not already say.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const key: TopicKey = isTopic(topic) ? topic : "general";
  const t = TOPICS[key];

  return (
    <>
      <Navbar />
      <main className="px-3 pb-4 sm:px-5">
        {/* A plate, like every other section on the site. It had the gutter
            already but sat on the page ground with nothing under it, so it read
            as loose text on a large empty sheet rather than as a page. */}
        <section className="slab settle lit">
          <div className="container py-12 md:py-20">
          {/* Switch intent without leaving the page — real links, no script. */}
          <nav
            aria-label="What are you writing about"
            className="mb-10 flex flex-wrap gap-x-6 gap-y-2 border-b border-rule pb-3 font-mono text-[12.5px] uppercase tracking-wide"
          >
            {(Object.keys(TOPICS) as TopicKey[]).map((k) => (
              <a
                key={k}
                href={hrefFor(k)}
                aria-current={k === key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-6 items-center border-b-2 pb-1 transition-colors duration-interaction ease-interaction",
                  k === key
                    ? "border-ink text-foreground"
                    : "border-transparent text-ink-muted hover:text-foreground",
                )}
              >
                {TOPICS[k].label}
              </a>
            ))}
          </nav>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h1 className="display-l text-balance">{t.title}</h1>
              <p className="lead mt-5 text-ink-muted">{t.blurb}</p>
              <p className="mt-5 font-mono text-[12.5px] text-ink-muted" data-fact>
                {t.fact}
              </p>

              {key === "enterprise" ? (
                <div className="mt-8">
                  <p
                    className="border-b border-rule pb-2.5 font-mono text-[12.5px] uppercase tracking-wide text-ink-muted"
                    data-fact
                  >
                    everything in Scale, plus
                  </p>
                  <ul className="ruled font-mono text-[12.5px] text-ink-muted">
                    {ENTERPRISE_PERKS.map((f) => (
                      <li key={f} className="py-2.5" data-fact>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="mt-8 border-t border-rule pt-5 text-sm text-ink-muted">
                Just want to start sending? Every tier is self-serve —{" "}
                <a href="/pricing" className="font-medium text-brass-text underline underline-offset-4">
                  see pricing
                </a>
                .
              </p>
            </div>

            <ContactForm topic={{ source: t.source, cta: t.cta, full: t.full }} />
          </div>
        </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
