import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mirrors the plans the product actually enforces (see packages/core PLANS).
// Each tier adds volume AND a capability, so the upgrade has a real trigger.
const tiers = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "For solo devs and side projects.",
    included: "3,000 emails / month",
    overage: "Free forever — no card",
    features: [
      "Transactional + marketing sends",
      "Full audit trail & suppression",
      "Sandbox (test-mode) keys",
      "Community support",
    ],
    cta: "Start free",
    href: "#cta",
    featured: false,
  },
  {
    name: "Pro",
    price: "$20",
    cadence: "/ month",
    blurb: "For startups shipping real product.",
    included: "50,000 emails / month",
    overage: "then $0.85 / 1,000",
    features: [
      "Everything in Free",
      "Reply threads & shared inbox",
      "Sequences & automation",
      "Campaigns & lists",
      "3 teammates · email support",
    ],
    cta: "Start sending",
    href: "#cta",
    featured: true,
  },
  {
    name: "Scale",
    price: "$80",
    cadence: "/ month",
    blurb: "For platforms onboarding their own customers.",
    included: "250,000 emails / month",
    overage: "then $0.70 / 1,000",
    features: [
      "Everything in Pro",
      "Sub-tenants — their own domains",
      "Per-tenant DKIM & reputation",
      "Team roles (RBAC) · unlimited seats",
    ],
    cta: "Start scaling",
    href: "#cta",
    featured: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "For scale, compliance & data residency.",
    included: "1M+ emails — committed-use",
    overage: "Volume discounts",
    features: [
      "Everything in Scale",
      "Proof bundles (Layer 3)",
      "Dedicated IPs & warming",
      "SSO / SAML · EU residency · SLA",
    ],
    cta: "Contact sales",
    href: "#",
    featured: false,
  },
];

// The floor every plan shares — so each tier is about volume and advanced layers,
// not table stakes.
const baseline = [
  "The full REST API & Node SDK",
  "Append-only audit trail",
  "Automatic suppression handling",
  "Webhooks & delivery events",
  "Sandbox (test-mode) keys",
  "Usage-based billing — pay only for what you send",
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

        <div className="mx-auto grid max-w-6xl items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

              <div className="mt-5 rounded-lg border bg-secondary/40 px-3 py-2.5">
                <div className="text-sm font-medium">{t.included}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.overage}</div>
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

        {/* Pay-as-you-go — for people who just want to send, no plan to pick. */}
        <div className="mx-auto mt-6 flex max-w-5xl flex-col items-start justify-between gap-4 rounded-2xl border border-dashed bg-card p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Zap className="size-5" />
            </span>
            <div>
              <p className="font-semibold">Only pay for what you send.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every plan includes a monthly volume; go over and it&apos;s just $0.85 / 1,000 on Pro,
                dropping to $0.50 at Enterprise — so growth never gets cheaper to leave. Free stays
                free and capped, and sandbox sends are always free.
              </p>
            </div>
          </div>
          <Link
            href="#cta"
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0 whitespace-nowrap")}
          >
            Start free
          </Link>
        </div>

        <div className="mx-auto mt-10 max-w-5xl rounded-2xl border bg-card p-6">
          <p className="text-sm font-semibold">Every plan includes</p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
            {baseline.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
