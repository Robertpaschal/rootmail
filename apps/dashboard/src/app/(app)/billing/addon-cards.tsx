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
 * Add-ons as real product cards. The control is a "how many MORE" stepper that
 * starts at ZERO — a green bubble shows what you already HAVE, and the card previews
 * what you'll HAVE after. You're only ever charged for the change (the backend
 * modifies your add-ons sub and Stripe prorates the delta). Capability add-ons
 * (roles/SSO/…) are an on/off "Add" once. Selections roll into a cart that shows the
 * added-monthly cost → in-app checkout.
 */
export function AddonCards({
  catalog,
  quantities,
}: {
  catalog: AddonCatalogItem[];
  quantities: Record<string, number>;
}) {
  const { open, pending } = useCheckout();
  // `add` = how many MORE to buy per add-on (delta, starts at 0). Toggles use 0/1.
  const [add, setAdd] = useState<Record<string, number>>({});

  // After a purchase the server quantities change → clear the deltas so the cards
  // show the new "you have" and the stepper resets to zero.
  const sig = catalog.map((a) => `${a.id}:${quantities[a.id] ?? 0}`).join(",");
  useEffect(() => setAdd({}), [sig]);

  const price = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const have = (a: AddonCatalogItem) => quantities[a.id] ?? 0;
  const delta = (a: AddonCatalogItem) => add[a.id] ?? 0;
  const setDelta = (a: AddonCatalogItem, d: number) => {
    const max = a.max ?? 9999;
    const room = max - have(a); // can't exceed the add-on's own cap
    setAdd((s) => ({ ...s, [a.id]: Math.max(0, Math.min(room, d)) }));
  };

  const changed = useMemo(() => catalog.some((a) => delta(a) > 0), [catalog, add]);
  const deltaTotal = useMemo(() => catalog.reduce((s, a) => s + delta(a) * price(a), 0), [catalog, add]);

  const review = () => {
    // Send the DESIRED TOTALS (have + delta); the backend charges only the delta.
    const addons: Record<string, number> = {};
    for (const [id, q] of Object.entries(quantities)) addons[id] = q;
    for (const a of catalog) addons[a.id] = have(a) + delta(a);
    void open({ kind: "addons", addons }, "your add-ons");
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((a) => {
          const Icon = ICONS[a.id] ?? Bot;
          const h = have(a);
          const d = delta(a);
          const isToggle = a.max === 1;
          const owned = h > 0;
          return (
            <motion.div key={a.id} layout>
              <Card className={cn("flex h-full flex-col transition-colors", (owned || d > 0) && "border-primary/40 ring-1 ring-primary/15")}>
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between">
                    <span className={cn("grid size-9 place-items-center rounded-lg", owned || d > 0 ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                      <Icon className="size-5" />
                    </span>
                    {owned ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        You have {isToggle ? "this" : h}
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
                      owned ? (
                        <div className="flex items-center justify-center gap-1 rounded-md bg-emerald-500/10 py-1.5 text-xs font-medium text-emerald-600">
                          <Check className="size-3.5" /> Included
                        </div>
                      ) : (
                        <Button type="button" variant={d > 0 ? "default" : "outline"} size="sm" className="w-full" onClick={() => setDelta(a, d > 0 ? 0 : 1)}>
                          {d > 0 ? (<><Check className="size-3.5" /> Adding</>) : "Add"}
                        </Button>
                      )
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-2">
                          <Button type="button" variant="outline" size="icon" className="size-8" disabled={d === 0} onClick={() => setDelta(a, d - 1)} aria-label={`Add fewer ${a.unit}`}>
                            <Minus className="size-3.5" />
                          </Button>
                          <div className="w-16 text-center">
                            <span className="text-sm font-semibold tabular-nums">+{d}</span>
                          </div>
                          <Button type="button" variant="outline" size="icon" className="size-8" disabled={a.max != null && h + d >= a.max} onClick={() => setDelta(a, d + 1)} aria-label={`Add more ${a.unit}`}>
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                        <p className="mt-1.5 h-4 text-center text-[11px] text-muted-foreground">
                          {d > 0 ? `You'll have ${h + d}` : owned ? `Buy more (you have ${h})` : "Choose how many"}
                        </p>
                      </>
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
              Adding <span className="font-semibold">{money(deltaTotal)}/mo</span>
              <span className="text-xs text-muted-foreground">— you keep everything you already have</span>
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdd({})}>
                Clear
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
