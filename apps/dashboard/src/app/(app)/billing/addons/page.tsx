import Link from "next/link";
import { ArrowRight, Layers, Megaphone, Zap } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { AddonCards } from "../addon-cards";

// Any add-on can be bought here on its own, with no wing plan attached — that's
// what makes this page the standalone store. (They are FILED under a wing in the
// catalog, which is a pricing detail, not a restriction: buying one never touches
// a wing's bill.) They bill monthly on one org-level add-ons subscription.
// This page is THE linkable add-on store: upgrade CTAs across the app deep-link
// here with ?focus=<addon_id> to land on (and highlight) the exact card to buy.
const num = (n: number) => n.toLocaleString();

export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
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
  const allAddons = billing.addons_catalog; // any add-on, standalone
  const seats = billing.summary.seats;

  return (
    <>
      {/* The description deliberately does NOT enumerate add-on ids: that list
          went stale the moment Data residency was retired, and it left the page
          promising something checkout could no longer sell. The cards below are
          rendered from the live catalog — let them be the list. */}
      <PageHeader
        title="Add-ons"
        description="Room for more — extra teammates, extra workspaces, bigger audiences, AI credits and the compliance pieces. Take only what you need; each is priced one at a time and you can drop it just as easily."
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
                Shared across everything you send — buying one changes only your add-ons bill, never a wing&apos;s.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddonCards catalog={allAddons} quantities={addonQty} focus={focus} />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/billing/transactional" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Transactional</span>
              <span className="ml-1 text-muted-foreground">— the mail your product owes someone, priced by how much you send.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
        <Link href="/billing/marketing" className="group flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/40">
          <span className="flex items-center gap-2 text-sm">
            <Megaphone className="size-4 text-muted-foreground" />
            <span>
              <span className="font-medium">Marketing</span>
              <span className="ml-1 text-muted-foreground">— campaigns to an audience, priced by how many contacts you keep.</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>
    </>
  );
}
