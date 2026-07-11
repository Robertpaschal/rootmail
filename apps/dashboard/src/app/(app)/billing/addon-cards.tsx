"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  FileCheck2,
  Globe2,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Layers,
  UserPlus,
} from "lucide-react";
import { useCheckout } from "./checkout-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem } from "@/lib/types";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const ICONS: Record<string, typeof Bot> = {
  extra_seat: UserPlus,
  workspace_pack: Layers,
  ai_credit_pack: Bot,
  custom_roles: KeyRound,
  sso_scim: ShieldCheck,
  proof_exports: FileCheck2,
  data_residency: Globe2,
  dedicated_ip: Globe2,
  subtenant_pack: Globe2,
};

/**
 * Add-ons as real product cards for STANDALONE purchase (wing-agnostic). Each card
 * reads like something you're buying: an icon, the price, a plain explanation, and
 * a control — a quantity stepper (showing what you already have) or an on/off
 * toggle for capabilities. Selections accumulate into a sticky cart → in-app
 * checkout. Framer-motion throughout.
 */
export function AddonCards({
  catalog,
  quantities,
}: {
  catalog: AddonCatalogItem[];
  quantities: Record<string, number>;
}) {
  const { open, pending } = useCheckout();
  const [desired, setDesired] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
    return d;
  });

  // Resync to server state after a purchase so what you own shows correctly.
  const sig = catalog.map((a) => `${a.id}:${quantities[a.id] ?? 0}`).join(",");
  useEffect(() => {
    const d: Record<string, number> = {};
    for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
    setDesired(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const price = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const set = (a: AddonCatalogItem, q: number) =>
    setDesired((d) => ({ ...d, [a.id]: Math.max(0, Math.min(a.max ?? 999, q)) }));

  const changed = useMemo(
    () => catalog.some((a) => (desired[a.id] ?? 0) !== (quantities[a.id] ?? 0)),
    [catalog, desired, quantities],
  );
  const total = useMemo(() => catalog.reduce((s, a) => s + (desired[a.id] ?? 0) * price(a), 0), [catalog, desired]);

  const review = () => {
    const addons: Record<string, number> = {};
    for (const a of catalog) addons[a.id] = desired[a.id] ?? 0;
    for (const [id, q] of Object.entries(quantities)) if (!(id in addons)) addons[id] = q;
    void open({ kind: "addons", addons }, "your add-ons");
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((a) => {
          const Icon = ICONS[a.id] ?? Bot;
          const qty = desired[a.id] ?? 0;
          const have = quantities[a.id] ?? 0;
          const isToggle = a.max === 1;
          const on = qty > 0;
          return (
            <motion.div key={a.id} layout>
              <Card className={cn("flex h-full flex-col transition-colors", on && "border-primary/40 ring-1 ring-primary/15")}>
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between">
                    <span className={cn("grid size-9 place-items-center rounded-lg", on ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                      <Icon className="size-5" />
                    </span>
                    {have > 0 ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        You have {isToggle ? "this" : have}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold">{a.name}</p>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">{a.description}</p>
                  <p className="mt-3 text-sm">
                    <span className="font-bold">${a.unit_amount}</span>
                    <span className="text-xs text-muted-foreground">/mo{isToggle ? "" : ` per ${a.unit}`}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{a.unit_note}</p>

                  <div className="mt-3">
                    {isToggle ? (
                      <Button type="button" variant={on ? "default" : "outline"} size="sm" className="w-full" onClick={() => set(a, on ? 0 : 1)}>
                        {on ? (
                          <>
                            <Check className="size-3.5" /> Selected
                          </>
                        ) : (
                          "Add"
                        )}
                      </Button>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Button type="button" variant="outline" size="icon" className="size-8" disabled={qty === 0} onClick={() => set(a, qty - 1)} aria-label={`Fewer ${a.unit}`}>
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-12 text-center text-sm font-semibold tabular-nums">{qty}</span>
                        <Button type="button" variant="outline" size="icon" className="size-8" disabled={a.max != null && qty >= a.max} onClick={() => set(a, qty + 1)} aria-label={`More ${a.unit}`}>
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {changed ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="sticky bottom-4 z-10 mx-auto mt-4 flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur"
          >
            <span className="flex items-center gap-2 text-sm">
              <ShoppingCart className="size-4 text-primary" />
              Add-ons <span className="font-semibold">{money(total)}/mo</span>
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => {
                const d: Record<string, number> = {};
                for (const a of catalog) d[a.id] = quantities[a.id] ?? 0;
                setDesired(d);
              }}>
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
