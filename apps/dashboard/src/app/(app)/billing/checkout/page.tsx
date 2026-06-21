import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/rootmail";
import { CheckoutConfigurator } from "./checkout-configurator";

export const metadata: Metadata = { title: "Checkout" };

// Only self-serve paid plans go through here (Free = cancel, Enterprise = sales).
const SELF_SERVE = new Set(["pro", "scale"]);

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { plan, interval } = await searchParams;
  const iv = interval === "year" ? "year" : "month";
  if (!plan || !SELF_SERVE.has(plan)) redirect("/billing");

  const billing = await api.getBilling().catch(() => null);
  if (!billing) redirect("/billing");
  const planObj = billing.plans.find((p) => p.id === plan);
  if (!planObj) redirect("/billing");

  // Pre-fill the configurator with the org's current add-on quantities.
  const currentQuantities: Record<string, number> = {};
  for (const a of billing.summary.add_ons) currentQuantities[a.id] = a.quantity;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Billing
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Upgrade to {planObj.name}</h1>
        <p className="text-sm text-muted-foreground">
          Configure your plan and pay — you stay right on this page.
        </p>
      </div>
      <CheckoutConfigurator
        plan={planObj}
        catalog={billing.addons_catalog}
        initialQuantities={currentQuantities}
        initialInterval={iv}
      />
    </div>
  );
}
