"use client";

import { useTransition } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { setAddon } from "./actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem } from "@/lib/types";

/**
 * Add-ons manager — each priced PER ONE with a plain-English note ("one is a
 * single client's sending domain"). Capability add-ons (roles/SSO/proof/residency,
 * `max: 1`) render as an on/off toggle; quantity add-ons (seats, workspaces, client
 * domains, IPs, AI packs) as a stepper. Wing-agnostic: the same component is shown
 * on every billing surface.
 */
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
        const isToggle = a.max === 1;
        const on = qty > 0;
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
              on && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {a.name}
                {onSale ? (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                    {a.sale_percent_off}% off
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
              <p className="mt-1 text-xs">
                {onSale ? (
                  <>
                    <span className="font-semibold text-foreground">${a.sale_price}</span>{" "}
                    <span className="text-muted-foreground line-through">${a.unit_amount}</span>
                  </>
                ) : (
                  <span className="font-semibold text-foreground">${a.unit_amount}</span>
                )}
                <span className="text-muted-foreground">
                  /mo{isToggle ? "" : ` per ${a.unit}`} · {a.unit_note}
                </span>
              </p>
            </div>

            {isToggle ? (
              <Button
                type="button"
                variant={on ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                disabled={pending}
                onClick={() => set(a.id, on ? 0 : 1)}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : on ? (
                  <>
                    <Check className="size-3.5" /> Enabled
                  </>
                ) : (
                  "Enable"
                )}
              </Button>
            ) : (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={pending || qty === 0}
                  onClick={() => set(a.id, qty - 1)}
                  aria-label={`Remove one ${a.unit}`}
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
                  disabled={pending || (a.max != null && qty >= a.max)}
                  onClick={() => set(a.id, qty + 1)}
                  aria-label={`Add one ${a.unit}`}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
