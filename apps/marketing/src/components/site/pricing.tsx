import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Illustrative pricing for the landing page — adjust to your go-to-market.
const tiers = [
  {
    name: "Developer",
    price: "$0",
    cadence: "forever",
    blurb: "For side projects and getting started.",
    features: [
      "1 workspace",
      "3,000 emails / month",
      "Mock + 1 live provider",
      "Full audit trail & suppression",
      "Community support",
    ],
    cta: "Start free",
    href: "#cta",
    featured: false,
  },
  {
    name: "Team",
    price: "$49",
    cadence: "/ month",
    blurb: "For platforms onboarding their own customers.",
    features: [
      "Everything in Developer",
      "Unlimited sub-tenants",
      "100,000 emails / month",
      "Per-tenant domains, DKIM & SPF",
      "Email support",
    ],
    cta: "Start sending",
    href: "#cta",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "For scale, compliance & data residency.",
    features: [
      "Everything in Team",
      "Dedicated IPs & warming",
      "Proof bundles (Layer 3)",
      "SSO & RBAC",
      "EU residency · SLA",
    ],
    cta: "Contact sales",
    href: "#",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">Pricing</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Start free. Pay when you scale.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            The same API at every tier — you only pay for the volume and the layers you switch on.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl items-start gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm",
                t.featured && "border-primary/50 shadow-md ring-1 ring-primary/20",
              )}
            >
              {t.featured ? (
                <Badge className="absolute -top-3 left-6">Most popular</Badge>
              ) : null}
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{t.price}</span>
                {t.cadence ? <span className="text-sm text-muted-foreground">{t.cadence}</span> : null}
              </div>
              <Link
                href={t.href}
                className={cn(
                  buttonVariants({ variant: t.featured ? "default" : "outline" }),
                  "mt-6 w-full",
                )}
              >
                {t.cta}
              </Link>
              <ul className="mt-6 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
