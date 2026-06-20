"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { changePlan } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

const FEATURE_LABELS: Record<string, string> = {
  audit: "Full audit trail",
  suppression: "Suppression & bounces",
  threads: "Reply threads & inbox",
  sequences: "Sequences & automation",
  campaigns: "Campaigns & lists",
  subtenants: "Sub-tenants (own domains)",
  rbac: "Team roles (RBAC)",
  proof: "Proof bundles",
  dedicated_ip: "Dedicated IPs",
  sso: "SSO / SAML",
  residency: "Data residency",
};

type Interval = "month" | "year";

function price(p: Plan, interval: Interval): string {
  if (p.price === null) return "Custom";
  if (p.price === 0) return "$0";
  if (interval === "year" && p.price_yearly != null) return `$${p.price_yearly}`;
  return `$${p.price}`;
}

export function PlanCards({ plans, currentId }: { plans: Plan[]; currentId: Plan["id"] }) {
  const order = plans.map((p) => p.id);
  const [interval, setInterval] = useState<Interval>("month");

  return (
    <>
    <div className="mb-4 inline-flex rounded-md border p-0.5 text-sm">
      {(["month", "year"] as const).map((iv) => (
        <button
          key={iv}
          type="button"
          onClick={() => setInterval(iv)}
          className={cn(
            "rounded px-3 py-1 font-medium transition-colors",
            interval === iv ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {iv === "month" ? "Monthly" : "Yearly (2 months free)"}
        </button>
      ))}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => {
        const isCurrent = p.id === currentId;
        const featured = p.id === "pro";
        return (
          <Card
            key={p.id}
            className={cn(
              "flex flex-col",
              featured && !isCurrent && "border-primary/40 ring-1 ring-primary/15",
              isCurrent && "border-primary ring-1 ring-primary/30",
            )}
          >
            <CardContent className="flex flex-1 flex-col p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                {isCurrent ? <Badge>Current</Badge> : featured ? <Badge variant="secondary">Popular</Badge> : null}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold">{price(p, interval)}</span>
                {p.price !== null && p.price > 0 ? (
                  <span className="text-xs text-muted-foreground">/{interval === "year" ? "yr" : "mo"}</span>
                ) : null}
              </div>
              {p.trial_days > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  {p.trial_days}-day free trial
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                {p.monthly_quota.toLocaleString()} emails / mo
                {p.allow_overage ? (
                  <>
                    , then ${p.overage_per_1000}/1k
                  </>
                ) : (
                  <> · hard cap</>
                )}
              </p>

              <ul className="mt-4 flex-1 space-y-1.5">
                <li className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {p.ai_credits === -1 ? "Unlimited AI credits" : `${p.ai_credits} AI credits / mo`}
                </li>
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {FEATURE_LABELS[f] ?? f}
                  </li>
                ))}
              </ul>

              <PlanButton
                planId={p.id}
                interval={interval}
                isCurrent={isCurrent}
                direction={order.indexOf(p.id) > order.indexOf(currentId) ? "up" : "down"}
                custom={p.price === null}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
    </>
  );
}

function PlanButton({
  planId,
  interval,
  isCurrent,
  direction,
  custom,
}: {
  planId: string;
  interval: Interval;
  isCurrent: boolean;
  direction: "up" | "down";
  custom: boolean;
}) {
  const [pending, start] = useTransition();

  if (isCurrent) {
    return (
      <Button variant="outline" className="mt-5 w-full" disabled>
        Current plan
      </Button>
    );
  }

  const label = custom ? "Contact sales" : direction === "up" ? "Upgrade" : "Switch";

  return (
    <Button
      variant={direction === "up" ? "default" : "outline"}
      className="mt-5 w-full"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Switch to the ${planId} plan (${interval === "year" ? "yearly" : "monthly"})?`)) return;
        const fd = new FormData();
        fd.set("plan", planId);
        fd.set("interval", interval);
        start(() => changePlan(fd));
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}
