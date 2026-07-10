import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { WingsPricing } from "./wings-pricing";

export default async function WingsPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; emails?: string; contacts?: string; team?: string }>;
}) {
  const params = await searchParams;
  let billing: Billing | null = null;
  let failed: string | null = null;
  try {
    billing = await api.getBilling();
  } catch (err) {
    failed = err instanceof ApiError || err instanceof ConnectionError ? err.message : "Something went wrong.";
  }

  const wings = billing?.wings;
  // Onboarding handoff — pre-fill + auto-run the quiz from the wizard's answers.
  const prefill =
    params.emails || params.contacts || params.team
      ? {
          emails: Number(params.emails) || undefined,
          contacts: Number(params.contacts) || undefined,
          team: Number(params.team) || undefined,
        }
      : undefined;

  return (
    <>
      <PageHeader
        title="Plans & pricing"
        description="Priced by what you actually use: Transactional by send volume, Marketing by contacts, Platform by your team — each billed on its own."
        backHref="/billing"
        backLabel="Plan & usage"
      />

      {params.checkout === "success" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          Payment complete — your wing updates the moment Stripe confirms it (a few seconds).
        </div>
      ) : params.checkout === "cancel" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <XCircle className="size-4 shrink-0" />
          Checkout canceled — nothing changed.
        </div>
      ) : null}

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect />
      ) : !wings ? (
        <p className="text-sm text-muted-foreground">Pricing isn&apos;t available right now.</p>
      ) : (
        <div className="space-y-8">
          <WingsPricing wings={wings} prefill={prefill} />

          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            <Link href="/billing" className="text-primary hover:underline">
              Back to your current plan &amp; usage
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
