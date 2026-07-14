import Link from "next/link";
import { Check, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { signupUrl } from "@/lib/links";
import { getPublicPricing } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Reveal } from "./motion";
import { BlocksCalculator, ContactPricer } from "./pricing-calculators";

// The floor every account shares — so the two wings are about what THEY do,
// not table stakes.
const baseline = [
  "The full REST API, Node SDK & CLI",
  "The AI assistant — build, send & diagnose",
  "Deliverability score & engagement analytics",
  "Append-only audit trail",
  "Automatic suppression handling",
  "1-click migration from SendGrid / Postmark / Mailgun",
  "Webhooks & delivery events",
  "Sandbox (test-mode) keys — always free",
];

/**
 * Pricing sells the REAL model: two independent wings (transactional = send
 * volume, marketing = audience size) + wing-agnostic add-ons priced per one.
 * Numbers come live from the public catalog (sales included), so this page and
 * the in-app purchase flow can never disagree.
 */
export async function Pricing() {
  const pricing = await getPublicPricing();
  const { addons } = pricing;

  return (
    <section id="pricing" className="border-t border-border/60 bg-secondary/30 py-20 md:py-28">
      <div className="container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Badge className="mb-4">Pricing</Badge>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Two products. Each priced by what it actually uses.
          </h2>
          <p className="mt-4 text-balance text-lg text-muted-foreground">
            Transactional email is priced by send volume. Marketing email is priced by audience size.
            Each is fully usable on its own — be free on one side and scale the other.
          </p>
        </div>

        {/* The two wings, sized honestly with the product's own math. */}
        <Reveal delay={0.05} className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-2">
          <BlocksCalculator tx={pricing.wings.transactional} />
          <ContactPricer mk={pricing.wings.marketing} />
        </Reveal>

        {/* Add-ons — wing-agnostic, per one, buyable with a plan or on their own. */}
        <Reveal delay={0.12} className="mx-auto mt-10 max-w-5xl">
          <div className="mb-5 text-center">
            <h3 className="text-xl font-bold tracking-tight">Add-ons — priced per one, no plan required</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              They work across both wings. Pick them at checkout (one bill) or buy them on their own —
              and buying more never re-bills what you already have.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {addons.map((a) => {
              const onSale = a.sale_price != null;
              return (
                <div key={a.id} className="flex flex-col rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{a.name}</p>
                    {onSale ? (
                      <Badge className="border-transparent bg-rose-600 text-white">{a.sale_percent_off}% off</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">{a.description}</p>
                  <p className="mt-3 text-sm">
                    {onSale ? (
                      <>
                        <span className="font-bold">${a.sale_price}</span>
                        <span className="ml-1 text-muted-foreground line-through">${a.unit_amount}</span>
                      </>
                    ) : (
                      <span className="font-bold">${a.unit_amount}</span>
                    )}
                    <span className="text-xs text-muted-foreground">/mo per {a.unit}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* The billing promises, in one strip. */}
        <Reveal delay={0.16} className="mx-auto mt-10 flex max-w-5xl flex-col items-start justify-between gap-4 rounded-2xl border border-dashed bg-card p-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Receipt className="size-5" />
            </span>
            <div>
              <p className="font-semibold">One bill. Never billed twice. Yearly = 2 months free.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add-ons picked with a plan appear inside the same checkout. Changing plans carries
                everything you own over and credits your unused time automatically. Go past your
                transactional volume and sending never stops — overage is billed per 1,000, and the
                free tiers simply pause at their cap.
              </p>
            </div>
          </div>
          <Link
            href={signupUrl}
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0 whitespace-nowrap")}
          >
            Start free
          </Link>
        </Reveal>

        <Reveal delay={0.2} className="mx-auto mt-10 max-w-5xl rounded-2xl border bg-card p-6">
          <p className="text-sm font-semibold">Every account includes</p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
            {baseline.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Need committed volume, invoicing, or bespoke terms?{" "}
            <Link href="/contact?topic=enterprise" className="font-medium text-primary hover:underline">
              Talk to us
            </Link>
            {" "}— custom plans ride the same platform.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
