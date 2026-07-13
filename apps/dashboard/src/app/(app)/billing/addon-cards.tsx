"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ChevronDown,
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
 * what you'll HAVE after. Checking out always opens the embedded Stripe checkout:
 * you're charged immediately for what you're ADDING, and everything you already own
 * is credited on the invoice (never billed twice). The cart pill expands into a full
 * order summary before you commit. `focus` (from ?focus= deep links) scrolls to and
 * highlights one card so upgrade CTAs land exactly on the thing to buy.
 */
export function AddonCards({
  catalog,
  quantities,
  focus,
}: {
  catalog: AddonCatalogItem[];
  quantities: Record<string, number>;
  focus?: string;
}) {
  const { open, pending } = useCheckout();
  // `add` = how many MORE to buy per add-on (delta, starts at 0). Toggles use 0/1.
  const [add, setAdd] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // After a purchase the server quantities change → clear the deltas so the cards
  // show the new "you have" and the stepper resets to zero.
  const sig = catalog.map((a) => `${a.id}:${quantities[a.id] ?? 0}`).join(",");
  useEffect(() => {
    setAdd({});
    setExpanded(false);
  }, [sig]);

  // Deep-linked card (?focus=extra_seat): scroll it into view and let its
  // highlight ring say "this is the one".
  useEffect(() => {
    if (!focus) return;
    const el = cardRefs.current[focus];
    if (el) {
      const t = setTimeout(
        () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
        150,
      );
      return () => clearTimeout(t);
    }
  }, [focus]);

  const price = (a: AddonCatalogItem) => a.sale_price ?? a.unit_amount;
  const have = (a: AddonCatalogItem) => quantities[a.id] ?? 0;
  const delta = (a: AddonCatalogItem) => add[a.id] ?? 0;
  const setDelta = (a: AddonCatalogItem, d: number) => {
    const max = a.max ?? 9999;
    const room = max - have(a); // can't exceed the add-on's own cap
    setAdd((s) => ({ ...s, [a.id]: Math.max(0, Math.min(room, d)) }));
  };

  const changedItems = useMemo(() => catalog.filter((a) => delta(a) > 0), [catalog, add]);
  const changed = changedItems.length > 0;
  const deltaTotal = useMemo(() => catalog.reduce((s, a) => s + delta(a) * price(a), 0), [catalog, add]);
  // What the whole add-ons bill becomes after this purchase (owned + added).
  const afterTotal = useMemo(
    () => catalog.reduce((s, a) => s + (have(a) + delta(a)) * price(a), 0),
    [catalog, add, quantities],
  );

  const review = () => {
    // Send the DESIRED TOTALS (have + delta); the checkout credits the owned part.
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
          const focused = focus === a.id;
          return (
            <motion.div key={a.id} layout ref={(el) => { cardRefs.current[a.id] = el; }}>
              <Card
                className={cn(
                  "flex h-full flex-col transition-colors",
                  (owned || d > 0) && "border-primary/40 ring-1 ring-primary/15",
                  focused && "border-primary ring-2 ring-primary/40",
                )}
              >
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between">
                    <span className={cn("grid size-9 place-items-center rounded-lg", owned || d > 0 || focused ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
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
            className="sticky bottom-4 z-10 mx-auto mt-4 w-full max-w-xl overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
          >
            {/* Expandable order summary — exactly what this purchase is, line by line. */}
            <AnimatePresence initial={false}>
              {expanded ? (
                <motion.div
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                >
                  <div className="border-b p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Order summary
                    </p>
                    <ul className="mt-2 divide-y">
                      {changedItems.map((a) => {
                        const h = have(a);
                        const d = delta(a);
                        const isToggle = a.max === 1;
                        return (
                          <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{a.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {isToggle ? "New — added to your account" : h > 0 ? `You have ${h} → you'll have ${h + d}` : `You'll have ${d}`}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-medium tabular-nums">{money(d * price(a))}/mo</p>
                              {!isToggle ? (
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  +{d} × {money(price(a))}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 space-y-1 border-t pt-3 text-sm">
                      <div className="flex items-center justify-between font-semibold">
                        <span>Due today — only what you&apos;re adding</span>
                        <span className="tabular-nums">{money(deltaTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Your add-ons after this purchase</span>
                        <span className="tabular-nums">{money(afterTotal)}/mo</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Everything you already have is credited at checkout — you&apos;re never billed twice for it.
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3 p-3">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="flex min-w-0 items-center gap-2 text-sm"
                aria-expanded={expanded}
              >
                <ShoppingCart className="size-4 shrink-0 text-primary" />
                <span className="truncate">
                  Adding <span className="font-semibold">{money(deltaTotal)}</span>
                  <span className="text-xs text-muted-foreground"> · {changedItems.length} add-on{changedItems.length === 1 ? "" : "s"}</span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                <span className="sr-only">{expanded ? "Hide" : "Show"} order details</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setAdd({}); setExpanded(false); }}>
                  Clear
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={review}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Review &amp; pay
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
