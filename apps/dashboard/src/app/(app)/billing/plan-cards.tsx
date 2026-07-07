"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { changePlan } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

// Each feature carries its plain-language meaning — the comparison should take
// the time to explain what a feature actually does, not just name it.
const FEATURE_LABELS: Record<string, string> = {
  audit: "Full audit trail",
  suppression: "Suppression & bounces",
  threads: "Replies & shared inbox",
  sequences: "Sequences & automation",
  campaigns: "Campaigns & lists",
  subtenants: "Client sending domains",
  rbac: "Custom team roles",
  proof: "Proof & compliance exports",
  dedicated_ip: "Dedicated IPs",
  sso: "SAML SSO + SCIM",
  residency: "Data residency",
};

const FEATURE_MEANING: Record<string, string> = {
  audit: "Every delivery event logged immutably — see exactly what happened to any email.",
  suppression: "Bounced and unsubscribed addresses are blocked automatically before every send.",
  threads: "Replies come back into a shared inbox instead of a noreply void.",
  sequences: "Automatic email series — welcome, onboard, follow up — that stop on reply.",
  campaigns: "Send one email to a whole list, with its own open and click funnel.",
  subtenants: "Each client sends from their own verified domain with isolated reputation.",
  rbac: "Decide exactly who on your team can send, edit content, or touch billing.",
  proof: "Cryptographically signed records that prove what you sent — verifiable by anyone.",
  dedicated_ip: "An IP address only you send from — your reputation, fully yours.",
  sso: "Your team signs in through Okta, Entra, or Google; leavers lose access automatically.",
  residency: "Choose where your organization's data is stored and processed.",
};

// Which wing each capability serves — transactional (product email reliability),
// marketing (audience email), or the shared platform.
type Wing = "transactional" | "marketing" | "platform";
const WING_OF: Record<string, Wing> = {
  suppression: "transactional",
  audit: "transactional",
  subtenants: "transactional",
  dedicated_ip: "transactional",
  campaigns: "marketing",
  sequences: "marketing",
  threads: "marketing",
  rbac: "platform",
  sso: "platform",
  proof: "platform",
  residency: "platform",
};

interface Line {
  label: string;
  meaning?: string;
}

/** The lines that belong on a given wing for a plan — quota/seats/etc. slot into
 * the wing they naturally describe, alongside that wing's feature flags. */
function wingLines(p: Plan, bucket: Wing): Line[] {
  const lines: Line[] = [];
  if (bucket === "transactional") {
    lines.push({
      label: `${p.monthly_quota.toLocaleString()} emails / month`,
      meaning: p.allow_overage
        ? `then $${p.overage_per_1000} per 1,000 — sending never just stops.`
        : "a hard cap — sending pauses until next month or an upgrade.",
    });
    lines.push({ label: "Send API, templates & test sandbox" });
  }
  if (bucket === "marketing") {
    lines.push({
      label: p.ai_credits === -1 ? "Unlimited AI assistant credits" : `${p.ai_credits} AI assistant credits / mo`,
      meaning: "Draft campaigns, build sequences, and diagnose delivery in plain language.",
    });
  }
  if (bucket === "platform") {
    lines.push({
      label: p.seats === -1 ? "Unlimited team seats" : `${p.seats} team seat${p.seats === 1 ? "" : "s"}`,
    });
    lines.push({
      label:
        p.workspace_limit === -1 ? "Unlimited workspaces" : `${p.workspace_limit} workspace${p.workspace_limit === 1 ? "" : "s"}`,
    });
  }
  for (const f of p.features) {
    if (WING_OF[f] !== bucket) continue;
    lines.push({
      label:
        f === "subtenants"
          ? `${p.included_sub_tenants === -1 ? "Unlimited" : p.included_sub_tenants} client sending domains`
          : (FEATURE_LABELS[f] ?? f),
      meaning: FEATURE_MEANING[f],
    });
  }
  return lines;
}

function WingGroup({ label, plan, bucket }: { label: string; plan: Plan; bucket: Wing }) {
  const lines = wingLines(plan, bucket);
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <ul className="mt-1 space-y-1.5">
        {lines.map((l, idx) => (
          <li key={idx} className="flex items-start gap-2 text-xs">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <span className="font-medium text-foreground">{l.label}</span>
              {l.meaning ? (
                <span className="block text-[11px] leading-snug text-muted-foreground">{l.meaning}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
              {(() => {
                const unit = interval === "year" ? "yr" : "mo";
                const saleAmt = interval === "year" ? p.sale_price_yearly : p.sale_price;
                const orig =
                  interval === "year" && p.price_yearly != null ? p.price_yearly : p.price;
                if (p.price !== null && p.price > 0 && saleAmt != null && orig != null) {
                  return (
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold">${saleAmt}</span>
                      <span className="text-sm text-muted-foreground line-through">${orig}</span>
                      <span className="text-xs text-muted-foreground">/{unit}</span>
                    </div>
                  );
                }
                return (
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{price(p, interval)}</span>
                    {p.price !== null && p.price > 0 ? (
                      <span className="text-xs text-muted-foreground">/{unit}</span>
                    ) : null}
                  </div>
                );
              })()}
              {p.sale_percent_off != null && p.sale_price != null ? (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  {p.sale_percent_off}% off
                  {p.sale_ends_at ? ` · ends ${new Date(p.sale_ends_at).toLocaleDateString()}` : ""}
                </p>
              ) : null}
              {p.trial_days > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  {p.trial_days}-day free trial
                </p>
              ) : null}
              {interval === "year" && p.price != null && p.price > 0 && p.price_yearly != null ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  Save ${p.price * 12 - p.price_yearly}/yr vs monthly
                </p>
              ) : null}
              {/* Capabilities grouped by the product's two wings, plus the shared
                  platform — so each plan says plainly what you get for
                  transactional and for marketing. */}
              <div className="mt-4 flex-1 space-y-3">
                <WingGroup label="Transactional" plan={p} bucket="transactional" />
                <WingGroup label="Marketing" plan={p} bucket="marketing" />
                <WingGroup label="Platform" plan={p} bucket="platform" />
              </div>

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
  const router = useRouter();

  if (isCurrent) {
    return (
      <Button variant="outline" className="mt-5 w-full" disabled>
        Current plan
      </Button>
    );
  }

  const label = custom ? "Contact sales" : direction === "up" ? "Upgrade" : "Switch";
  // Paid plans go to the on-page checkout; Free (cancel/downgrade) and custom keep
  // the direct action.
  const toCheckout = !custom && planId !== "free";

  return (
    <Button
      variant={direction === "up" ? "default" : "outline"}
      className="mt-5 w-full"
      disabled={pending}
      onClick={() => {
        if (custom) {
          // Enterprise/custom is sales-assisted — open the in-app sales contact
          // (creates a lead with org context for staff to provision a custom plan)
          // rather than attempting a self-serve switch the API rejects.
          start(() => router.push("/contact?topic=sales"));
          return;
        }
        if (toCheckout) {
          start(() => router.push(`/billing/checkout?plan=${planId}&interval=${interval}`));
          return;
        }
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
