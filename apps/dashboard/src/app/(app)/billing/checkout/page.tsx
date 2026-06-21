import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/rootmail";
import { EmbeddedCheckoutPanel } from "./embedded-checkout";

export const metadata: Metadata = { title: "Checkout" };

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  scale: "Scale",
  enterprise: "Enterprise",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { plan, interval } = await searchParams;
  const iv = interval === "year" ? "year" : "month";
  // Free has nothing to pay; Enterprise is sales-assisted; unknown → bounce back.
  if (!plan || !PLAN_NAMES[plan] || plan === "free" || plan === "enterprise") {
    redirect("/billing");
  }

  // Prefer on-page (embedded) checkout.
  let embedded: Awaited<ReturnType<typeof api.embeddedCheckout>> | null = null;
  try {
    embedded = await api.embeddedCheckout(plan, iv);
  } catch {
    embedded = null;
  }

  if (embedded?.available) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/billing"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Billing
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Upgrade to {PLAN_NAMES[plan]}</h1>
          <p className="text-sm text-muted-foreground">
            {iv === "year" ? "Billed yearly" : "Billed monthly"} · complete payment below — you stay
            right here.
          </p>
        </div>
        <EmbeddedCheckoutPanel
          clientSecret={embedded.client_secret}
          publishableKey={embedded.publishable_key}
        />
      </div>
    );
  }

  // Fallback: hosted Checkout redirect (Stripe mode w/o embedded), or local apply
  // (self-host). redirect() must run outside try/catch — it throws to signal.
  let hostedUrl: string | null = null;
  try {
    const res = await api.checkout(plan, iv);
    if (res.mode === "stripe" && res.url) hostedUrl = res.url;
  } catch {
    /* fall through to billing */
  }
  if (hostedUrl) redirect(hostedUrl);
  redirect("/billing?checkout=success");
}
