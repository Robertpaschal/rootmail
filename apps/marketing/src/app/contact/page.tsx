import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Badge } from "@/components/ui/badge";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact sales",
  description:
    "Talk to the rootmail team about a custom enterprise plan — committed-use volume, SSO/SAML, data residency, dedicated IPs, and an SLA.",
};

const enterprise = [
  "Committed-use volume with the deepest overage discounts",
  "SSO / SAML and SCIM provisioning",
  "EU data residency & a signed DPA",
  "Dedicated IPs with managed warming",
  "Unlimited AI credits",
  "A named contact and an uptime SLA",
];

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="container py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="lg:pt-4">
            <Badge className="mb-4">Get in touch</Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Let&apos;s talk.
            </h1>
            <p className="mt-4 text-balance text-lg text-muted-foreground">
              A custom plan, a question about the product, or just want to say hello — tell us
              what&apos;s on your mind and we&apos;ll get back to you, usually within one business
              day. No pressure, no spam.
            </p>

            <div className="mt-8 rounded-2xl border bg-secondary/30 p-6">
              <p className="text-sm font-semibold">Enterprise includes everything in Scale, plus</p>
              <ul className="mt-4 space-y-3">
                {enterprise.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              Just want to start sending? Every tier is self-serve —{" "}
              <a href="/pricing" className="font-medium text-foreground underline">
                see pricing
              </a>
              .
            </p>
          </div>

          <ContactForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
