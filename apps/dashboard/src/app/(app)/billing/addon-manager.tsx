"use client";

import { useTransition } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { setAddon } from "./actions";
import { Button } from "@/components/ui/button";

// Mirrors ADD_ONS in packages/core. Add-ons extend quantities; they never
// unlock a gated feature (that needs the tier), so stacking them stays pricier
// than upgrading — the intended nudge.
const CATALOG: { id: string; label: string; unit: string; price: number }[] = [
  { id: "extra_seat", label: "Extra seats", unit: "seat", price: 8 },
  { id: "ai_credit_pack", label: "AI credit packs", unit: "100 credits/mo", price: 5 },
  { id: "subtenant_pack", label: "Sub-tenant packs", unit: "pack of 10", price: 15 },
  { id: "dedicated_ip", label: "Dedicated IPs", unit: "IP", price: 30 },
];

export function AddonManager({ quantities }: { quantities: Record<string, number> }) {
  const [pending, start] = useTransition();

  const set = (id: string, qty: number) => {
    const fd = new FormData();
    fd.set("addon_id", id);
    fd.set("quantity", String(Math.max(0, qty)));
    start(() => setAddon(fd));
  };

  return (
    <div className="space-y-2">
      {CATALOG.map((a) => {
        const qty = quantities[a.id] ?? 0;
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-xs text-muted-foreground">
                ${a.price}/mo per {a.unit}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                disabled={pending || qty === 0}
                onClick={() => set(a.id, qty - 1)}
                aria-label={`Remove one ${a.label}`}
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
                aria-label={`Add one ${a.label}`}
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
