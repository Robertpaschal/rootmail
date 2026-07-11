import Link from "next/link";
import { ArrowRight, Layers, Megaphone, Zap } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { AddonCards } from "../addon-cards";

// Add-ons are wing-AGNOSTIC — the "platform" foundation is now just these, shown
// everywhere. Transactional-flavoured ones (dedicated IP, client domains) live on
// the Transactional page folded into blocks; everything else is here.
const PLATFORM_GROUP = "platform";

const num = (n: number) => n.toLocaleString();

export default async function AddonsPage() {
  let billing: Billing | null = null;
  let failed: string | null = null;
  try {
    billing = await api.getBilling();
  } catch (err) {
    failed = err instanceof ApiError || err instanceof ConnectionError ? err.message : "Something went wrong.";
  }

  if (failed || !billing) {
    return (
      <>
        <PageHeader title="Add-ons" backHref="/billing" backLabel="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "Add-ons aren't available right now."} showReconnect />
      </>
    );
  }

  const addonQty: Record<string, number> = {};
  for (const a of billing.summary.add_ons) addonQty[a.id] = a.quantity;
  const platformAddons = billing.addons_catalog.filter((a) => a.group === PLATFORM_GROUP);
  const seats = billing.summary.seats;

  return (
    <>
      <PageHeader
        title="Add-ons"
        description="Extras that work across both wings — seats, workspaces, team roles, SSO, proof exports, residency, and AI credits. Add exactly what you need; each is priced per one."
        backHref="/billing"
        backLabel="Plan & usage"
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-secondary">
              <Layers className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {seats.capacity === -1
                  ? `${num(seats.used)} seats in use · unlimited`
                  : `${num(seats.used)} of ${num(seats.capacity)} seats in use`}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({seats.included} included{seats.purchased ? ` + ${seats.purchased} added` : ""})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                These are shared foundation features — buying one changes only your add-ons bill, never a wing&apos;s.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddonCards catalog={platformAddons} quantities={addonQty} />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Transactional</span>
              <span className="ml-1 text-muted-foreground">— send blocks + dedicated IP &amp; client domains.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href="/billing/marketing" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing</span>
              <span className="ml-1 text-muted-foreground">— audience email, priced by contact size.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </>
  );
}
