import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { WingLadder } from "./wing-ladder";

export default async function WingsPricingPage() {
  let billing: Billing | null = null;
  let failed: string | null = null;
  try {
    billing = await api.getBilling();
  } catch (err) {
    failed = err instanceof ApiError || err instanceof ConnectionError ? err.message : "Something went wrong.";
  }

  const wings = billing?.wings;

  return (
    <>
      <PageHeader
        title="Pricing by wing"
        description="Two products, priced independently — pay for what you actually use on each side, and stay Free on the other."
        backHref="/billing"
        backLabel="Plan & usage"
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect />
      ) : !wings ? (
        <p className="text-sm text-muted-foreground">Per-wing pricing isn&apos;t available yet.</p>
      ) : (
        <div className="space-y-8">
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">A preview of rootmail&apos;s new pricing.</p>
              <p className="mt-0.5 text-muted-foreground">
                Transactional is sized by send volume, Marketing by contacts, and Platform by your team —
                each on its own plan, so you can be Free on one and scale the other. Your current plan is
                unchanged; choosing tiers here goes live soon.
              </p>
            </div>
          </div>

          <WingLadder wing="transactional" ladder={wings.transactional} />
          <WingLadder wing="marketing" ladder={wings.marketing} />
          <WingLadder wing="platform" ladder={wings.platform} />

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
