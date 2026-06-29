import type { Metadata } from "next";
import { Check, LifeBuoy } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ContactForm } from "./contact-form";

const ENTERPRISE_PERKS = [
  "Committed-use volume with the deepest overage discounts",
  "SSO / SAML and SCIM provisioning",
  "EU data residency & a signed DPA",
  "Dedicated IPs with managed warming",
  "Unlimited AI credits",
  "A named contact and an uptime SLA",
];

// Each entry point lands on the right intent. `source` tags the lead so the team can
// triage by reason; `full` shows the sales/enterprise qualifying fields.
const TOPICS = {
  general: {
    label: "General",
    badge: "Get in touch",
    title: "Let’s talk.",
    blurb:
      "A question about the product, feedback, or just want to say hello — tell us what’s on your mind and we’ll get back to you, usually within one business day. No pressure, no spam.",
    cta: "Send message",
    source: "contact_general",
    full: false,
  },
  sales: {
    label: "Sales",
    badge: "Talk to sales",
    title: "Find the right plan.",
    blurb:
      "Planning a migration or scaling up your sending? Tell us about your use case and volume and we’ll help you land on the right plan — overage discounts, sub-tenancy, seats, and more.",
    cta: "Talk to sales",
    source: "contact_sales",
    full: true,
  },
  enterprise: {
    label: "Enterprise",
    badge: "Enterprise",
    title: "A custom enterprise plan.",
    blurb:
      "Committed-use volume, SSO/SAML, EU data residency, dedicated IPs, an uptime SLA, and a named contact. Tell us your requirements and we’ll scope it with you.",
    cta: "Contact sales",
    source: "contact_enterprise",
    full: true,
  },
  support: {
    label: "Support",
    badge: "Support",
    title: "Get a hand.",
    blurb:
      "Hit a snag? Describe what’s happening and we’ll help. If you’re already signed in, the in-app AI assistant can often diagnose and fix it instantly — and the docs cover the common cases.",
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
  return { title: t.label === "General" ? "Contact" : t.badge, description: t.blurb };
}

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
      <main className="container py-16 md:py-24">
        {/* Switch intent without leaving the page. */}
        <div className="mb-8 inline-flex flex-wrap gap-1 rounded-lg border bg-secondary/30 p-1">
          {(Object.keys(TOPICS) as TopicKey[]).map((k) => (
            <a
              key={k}
              href={hrefFor(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                k === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TOPICS[k].label}
            </a>
          ))}
        </div>

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="lg:pt-2">
            <Badge className="mb-4">{t.badge}</Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
            <p className="mt-4 text-balance text-lg text-muted-foreground">{t.blurb}</p>

            {key === "enterprise" ? (
              <div className="mt-8 rounded-2xl border bg-secondary/30 p-6">
                <p className="text-sm font-semibold">Enterprise includes everything in Scale, plus</p>
                <ul className="mt-4 space-y-3">
                  {ENTERPRISE_PERKS.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {key === "support" ? (
              <div className="mt-8 flex items-start gap-3 rounded-2xl border bg-secondary/30 p-6">
                <LifeBuoy className="mt-0.5 size-5 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Already a customer? The <span className="font-medium text-foreground">in-app assistant</span> can
                  diagnose bounces, deliverability, and setup right inside your dashboard — often faster than email.
                </p>
              </div>
            ) : null}

            <p className="mt-6 text-sm text-muted-foreground">
              Just want to start sending? Every tier is self-serve —{" "}
              <a href="/pricing" className="font-medium text-foreground underline">
                see pricing
              </a>
              .
            </p>
          </div>

          <ContactForm topic={{ source: t.source, cta: t.cta, full: t.full }} />
        </div>
      </main>
      <Footer />
    </>
  );
}
