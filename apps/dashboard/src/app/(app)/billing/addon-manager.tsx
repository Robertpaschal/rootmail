"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Minus, Plus, ShoppingCart } from "lucide-react";
import { useCheckout } from "./checkout-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem } from "@/lib/types";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/**
 * Add-ons as a CART: toggle/step selections locally (edit freely, back and forth),
 * see the running monthly total, then "Review & pay" opens the in-app checkout —
 * so add-ons actually add up to a payment. Capability add-ons (roles/SSO/proof/
 * residency, max: 1) are on/off toggles; quantity add-ons step. Wing-agnostic —
 * the same component appears on every billing surface.
 */
export function AddonManager({
  quantities,
  catalog,
}: {
  quantities: Record<string, number>;
  catalog: AddonCatalogItem[];
}) {
  const { open, pending } = useCheckout();
  // Desired quantities (the cart), seeded from what's currently active.
  const [desired, setDesired] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
    return d;
  });

  // Resync the cart baseline when the server state changes (e.g. after a checkout
  // completes and the page revalidates) so purchased add-ons actually show as
  // selected instead of the cart looking untouched.
  const qtySig = catalog.map((a) => `${a.id}:${quantities[a.id] ?? 0}`).join(",");
  useEffect(() => {
    const d: Record<string, number> = {};
    for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
    setDesired(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtySig]);

  const price = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const set = (a: AddonCatalogItem, qty: number) => {
    const max = a.max ?? 999;
    setDesired((d) => ({ ...d, [a.id]: Math.max(0, Math.min(max, qty)) }));
  };

  const changed = useMemo(
    () => catalog.some((a) => (desired[a.id] ?? 0) !== (quantities[a.id] ?? 0)),
    [catalog, desired, quantities],
  );
  const total = useMemo(
    () => catalog.reduce((s, a) => s + (desired[a.id] ?? 0) * price(a), 0),
    [catalog, desired],
  );

  const review = () => {
    // The whole desired add-on set — the API creates/updates the add-ons sub.
    const addons: Record<string, number> = {};
    for (const a of catalog) addons[a.id] = desired[a.id] ?? 0;
    // Include add-ons not in this catalog slice so we never zero another group's.
    for (const [id, q] of Object.entries(quantities)) if (!(id in addons)) addons[id] = q;
    void open({ kind: "addons", addons }, "your add-ons");
  };

  return (
    <div className="space-y-2">
      {catalog.map((a) => {
        const qty = desired[a.id] ?? 0;
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
                onClick={() => set(a, on ? 0 : 1)}
              >
                {on ? (
                  <>
                    <Check className="size-3.5" /> Selected
                  </>
                ) : (
                  "Add"
                )}
              </Button>
            ) : (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="outline" size="icon" className="size-7" disabled={qty === 0} onClick={() => set(a, qty - 1)} aria-label={`Remove one ${a.unit}`}>
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center text-sm font-medium tabular-nums">{qty}</span>
                <Button type="button" variant="outline" size="icon" className="size-7" disabled={a.max != null && qty >= a.max} onClick={() => set(a, qty + 1)} aria-label={`Add one ${a.unit}`}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* The cart footer — appears when the selection changes; opens checkout. */}
      <AnimatePresence>
        {changed ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="sticky bottom-3 z-10 mt-3 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur"
          >
            <div className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-primary" />
              <span>
                Add-ons total <span className="font-semibold">{money(total)}/mo</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const d: Record<string, number> = {};
                  for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
                  setDesired(d);
                }}
              >
                Reset
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={review}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Review &amp; pay
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
