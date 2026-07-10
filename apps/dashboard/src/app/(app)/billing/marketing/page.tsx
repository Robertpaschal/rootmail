import { CheckCircle2, XCircle } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { MarketingBilling } from "./client";

export default async function MarketingBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; contacts?: string; team?: string }>;
}) {
  const params = await searchParams;
  let billing: Billing | null = null;
  let failed: string | null = null;
  try {
    billing = await api.getBilling();
  } catch (err) {
    failed = err instanceof ApiError || err instanceof ConnectionError ? err.message : "Something went wrong.";
  }

  if (failed || !billing?.wings) {
    return (
      <>
        <PageHeader title="Marketing plan" backHref="/billing" backLabel="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "Pricing isn't available right now."} showReconnect />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Marketing plan"
        description="Audience email — campaigns, sequences, replies — priced by how many contacts you keep. A campaign to everyone is always included."
        backHref="/billing"
        backLabel="Plan & usage"
      />

      {params.checkout === "success" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          Payment complete — your marketing plan updates the moment Stripe confirms it.
        </div>
      ) : params.checkout === "cancel" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <XCircle className="size-4 shrink-0" />
          Checkout canceled — nothing changed.
        </div>
      ) : null}

      <MarketingBilling
        billing={billing}
        prefillContacts={Number(params.contacts) || undefined}
        stitch={{ team: Number(params.team) || undefined }}
      />
    </>
  );
}
