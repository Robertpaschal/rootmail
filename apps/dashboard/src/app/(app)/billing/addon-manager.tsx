"use client";

import { useTransition } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { setAddon } from "./actions";
import { Button } from "@/components/ui/button";
import type { AddonCatalogItem } from "@/lib/types";

// Add-ons extend quantities; they never unlock a gated feature (that needs the
// tier), so stacking them stays pricier than upgrading — the intended nudge.
// Display copy per add-on; prices + sales come live from the catalog.
const LABELS: Record<string, string> = {
  extra_seat: "Extra seats",
  ai_credit_pack: "AI credit packs",
  subtenant_pack: "Sub-tenant packs",
  workspace_pack: "Workspace packs",
  dedicated_ip: "Dedicated IPs",
};

export function AddonManager({
  quantities,
  catalog,
}: {
  quantities: Record<string, number>;
  catalog: AddonCatalogItem[];
}) {
  const [pending, start] = useTransition();

  const set = (id: string, qty: number) => {
    const fd = new FormData();
    fd.set("addon_id", id);
    fd.set("quantity", String(Math.max(0, qty)));
    start(() => setAddon(fd));
  };

  return (
    <div className="space-y-2">
      {catalog.map((a) => {
        const qty = quantities[a.id] ?? 0;
        const onSale = a.sale_price != null;
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {LABELS[a.id] ?? a.name}
                {onSale ? (
                  <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                    {a.sale_percent_off}% off
                  </span>
                ) : null}
              </p>
              {onSale ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">${a.sale_price}</span>{" "}
                  <span className="line-through">${a.unit_amount}</span>/mo per {a.unit}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  ${a.unit_amount}/mo per {a.unit}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                disabled={pending || qty === 0}
                onClick={() => set(a.id, qty - 1)}
                aria-label={`Remove one ${LABELS[a.id] ?? a.name}`}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-6 text-center text-sm font-medium tabular-nums">
                {pending ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : qty}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                disabled={pending}
                onClick={() => set(a.id, qty + 1)}
                aria-label={`Add one ${LABELS[a.id] ?? a.name}`}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
