import { CheckCircle2, XCircle } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { AddonManager } from "../addon-manager";
import { TransactionalBilling } from "./client";

// Add-ons that belong to THIS wing (they bill on the transactional subscription).
const TX_ADDONS = new Set(["dedicated_ip", "subtenant_pack"]);

export default async function TransactionalBillingPage({
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

  if (failed || !billing?.wings) {
    return (
      <>
        <PageHeader title="Transactional plan" backHref="/billing" backLabel="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "Pricing isn't available right now."} showReconnect />
      </>
    );
  }

  const addonQty: Record<string, number> = {};
  for (const a of billing.summary.add_ons) addonQty[a.id] = a.quantity;
  const txCatalog = billing.addons_catalog.filter((a) => TX_ADDONS.has(a.id));

  return (
    <>
      <PageHeader
        title="Transactional plan"
        description="Product email — receipts, resets, alerts — priced by send volume alone. Buy blocks of 25,000 sends; scaling is never punished."
        backHref="/billing"
        backLabel="Plan & usage"
      />

      {params.checkout === "success" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          Payment complete — your transactional plan updates the moment Stripe confirms it.
        </div>
      ) : params.checkout === "cancel" ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <XCircle className="size-4 shrink-0" />
          Checkout canceled — nothing changed.
        </div>
      ) : null}

      <TransactionalBilling
        billing={billing}
        prefillEmails={Number(params.emails) || undefined}
        stitch={{
          contacts: Number(params.contacts) || undefined,
          team: Number(params.team) || undefined,
        }}
      />

      {txCatalog.length ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Transactional add-ons</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              These extend this wing and bill on its subscription — a paid transactional plan comes first.
            </p>
            <AddonManager quantities={addonQty} catalog={txCatalog} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
