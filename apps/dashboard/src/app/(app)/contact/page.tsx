import type { Metadata } from "next";
import Link from "next/link";
import { Check, LifeBuoy, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/rootmail";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact" };

const TOPICS = {
  support: {
    title: "Get support",
    blurb:
      "Describe what's happening and we'll help. The in-app assistant can often diagnose and fix things instantly — but a human is here whenever you need one.",
    cta: "Send to support",
    showVolume: false,
  },
  sales: {
    title: "Talk to sales",
    blurb:
      "Scaling up, or need an Enterprise plan — committed volume, SSO/SAML, EU residency, dedicated IPs, an SLA? Tell us about your use case and we'll scope a custom plan with you.",
    cta: "Contact sales",
    showVolume: true,
  },
  general: {
    title: "Get in touch",
    blurb: "A question, feedback, or anything else — we'd love to hear from you.",
    cta: "Send message",
    showVolume: false,
  },
} as const;

type TopicKey = keyof typeof TOPICS;
const isTopic = (v: string | undefined): v is TopicKey => v != null && v in TOPICS;

const ENTERPRISE_PERKS = [
  "Committed-use volume with the deepest overage discounts",
  "SSO / SAML, EU data residency, and a signed DPA",
  "Dedicated IPs with managed warming, plus an uptime SLA",
  "Unlimited AI credits and workspaces, and a named contact",
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const key: TopicKey = isTopic(topic) ? topic : "support";
  const t = TOPICS[key];

  let defaults = { name: "", email: "" };
  try {
    const me = await api.me();
    defaults = { name: me.user.name ?? "", email: me.user.email };
  } catch {
    /* render with empty prefill if the lookup fails */
  }

  return (
    <>
      <PageHeader title={t.title} description={t.blurb} />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card>
          <CardContent className="p-6">
            <ContactForm topic={key} cta={t.cta} showVolume={t.showVolume} defaults={defaults} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {key === "support" ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">Try the assistant first</p>
                  <p className="mt-1 text-muted-foreground">
                    It can diagnose bounces, deliverability, and setup right now — often faster than
                    waiting on a reply.{" "}
                    <Link href="/assistant" className="font-medium text-foreground underline">
                      Open the assistant →
                    </Link>
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {key === "sales" ? (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-medium">Enterprise includes</p>
                <ul className="mt-3 space-y-2">
                  {ENTERPRISE_PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="flex items-start gap-3 p-5">
              <LifeBuoy className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                We typically reply within one business day.{" "}
                {key === "support" ? (
                  <>
                    Need plans or pricing?{" "}
                    <Link href="/contact?topic=sales" className="font-medium text-foreground underline">
                      Talk to sales
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Need help with your account?{" "}
                    <Link href="/contact?topic=support" className="font-medium text-foreground underline">
                      Get support
                    </Link>
                    .
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
