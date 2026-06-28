"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Minus, Plus } from "lucide-react";
import { createEmbeddedSession } from "../actions";
import { EmbeddedCheckoutPanel } from "./embedded-checkout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AddonCatalogItem, Plan } from "@/lib/types";

const ADDON_LABELS: Record<string, string> = {
  extra_seat: "Extra seats",
  ai_credit_pack: "AI credit packs",
  subtenant_pack: "Sub-tenant packs",
  workspace_pack: "Workspace packs",
  dedicated_ip: "Dedicated IPs",
};

type Interval = "month" | "year";

/**
 * Configure a plan (interval + add-ons) with a live total, then pay inline. Add-ons
 * bill monthly, so they're only selectable on monthly billing (Stripe requires one
 * interval per subscription). "Continue" creates the embedded session from exactly
 * this config and mounts Stripe's payment form below.
 */
export function CheckoutConfigurator({
  plan,
  catalog,
  initialQuantities,
  initialInterval,
}: {
  plan: Plan;
  catalog: AddonCatalogItem[];
  initialQuantities: Record<string, number>;
  initialInterval: Interval;
}) {
  const [interval, setIntervalState] = useState<Interval>(initialInterval);
  const [qtys, setQtys] = useState<Record<string, number>>(initialQuantities);
  const [session, setSession] = useState<{ clientSecret: string; publishableKey: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const planMonthly = plan.sale_price ?? plan.price ?? 0;
  const planYearly = plan.sale_price_yearly ?? plan.price_yearly ?? 0;
  // Add-ons bill at the chosen interval now (a yearly sub uses yearly add-on prices).
  const addonsActive = true;
  const addonUnitPrice = (a: { unit_amount: number; unit_amount_yearly: number; sale_price: number | null; sale_price_yearly: number | null }) =>
    interval === "year" ? (a.sale_price_yearly ?? a.unit_amount_yearly) : (a.sale_price ?? a.unit_amount);
  const addonsTotal = catalog.reduce((sum, a) => sum + (qtys[a.id] ?? 0) * addonUnitPrice(a), 0);
  const unit = interval === "year" ? "yr" : "mo";
  const total = (interval === "year" ? planYearly : planMonthly) + addonsTotal;

  if (session) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSession(null)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Edit configuration
        </button>
        <EmbeddedCheckoutPanel
          clientSecret={session.clientSecret}
          publishableKey={session.publishableKey}
        />
      </div>
    );
  }

  const setQty = (id: string, q: number) => setQtys((m) => ({ ...m, [id]: Math.max(0, q) }));

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        {(["month", "year"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            onClick={() => setIntervalState(iv)}
            className={cn(
              "rounded px-3 py-1 font-medium transition-colors",
              interval === iv
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {iv === "month" ? "Monthly" : "Yearly (2 months free)"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <div className="font-medium">{plan.name} plan</div>
          {plan.sale_percent_off ? (
            <div className="text-xs font-medium text-rose-600">{plan.sale_percent_off}% off</div>
          ) : null}
        </div>
        <div className="text-sm font-medium tabular-nums">
          ${interval === "year" ? planYearly : planMonthly}/{unit}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add-ons</p>
          {!addonsActive ? (
            <p className="text-xs text-muted-foreground">Billed monthly — switch to monthly to add</p>
          ) : null}
        </div>
        {catalog.map((a) => {
          const q = qtys[a.id] ?? 0;
          const onSale = a.sale_price != null;
          const label = ADDON_LABELS[a.id] ?? a.name;
          return (
            <div
              key={a.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border p-2.5",
                !addonsActive && "opacity-50",
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {onSale ? (
                    <>
                      <span className="font-medium text-foreground">
                        ${interval === "year" ? (a.sale_price_yearly ?? a.unit_amount_yearly) : a.sale_price}
                      </span>{" "}
                      <span className="line-through">
                        ${interval === "year" ? a.unit_amount_yearly : a.unit_amount}
                      </span>
                    </>
                  ) : (
                    <>${interval === "year" ? a.unit_amount_yearly : a.unit_amount}</>
                  )}
                  /{unit} per {a.unit}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={!addonsActive || q === 0}
                  onClick={() => setQty(a.id, q - 1)}
                  aria-label={`Remove one ${label}`}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center text-sm font-medium tabular-nums">{q}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={!addonsActive}
                  onClick={() => setQty(a.id, q + 1)}
                  aria-label={`Add one ${label}`}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-bold tabular-nums">
            ${total}
            <span className="text-sm font-normal text-muted-foreground">/{unit}</span>
          </div>
        </div>
        <Button
          size="lg"
          disabled={pending}
          onClick={() => {
            setError(null);
            const addons = qtys;
            start(async () => {
              const res = await createEmbeddedSession(plan.id, interval, addons);
              if ("clientSecret" in res) {
                setSession({ clientSecret: res.clientSecret, publishableKey: res.publishableKey });
              } else if ("redirectUrl" in res) {
                window.location.href = res.redirectUrl;
              } else {
                setError(res.error);
              }
            });
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue to payment
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
