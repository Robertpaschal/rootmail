import Link from "next/link";
import { ArrowRight, Check, Tag } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddonManager } from "./addon-manager";
import { PlanCards } from "./plan-cards";
import { BillingTabs } from "./billing-tabs";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "plans" ? "plans" : "usage";

  let billing: Billing | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    billing = await api.getBilling();
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (failed || !billing) {
    return (
      <>
        <PageHeader title="Plan & usage" />
        <ConnectionErrorCard message={failed ?? "No billing data."} showReconnect={isApiErr} />
      </>
    );
  }

  const { plan, usage, plans, summary, addons_catalog } = billing;
  const addonQty: Record<string, number> = {};
  for (const a of summary.add_ons) addonQty[a.id] = a.quantity;
  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const barColor = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";
  const nearLimit = !usage.over_limit && pct >= 80;
  // At/near the cap, recommend the next paid tier that actually raises it — surfaced
  // as a personalized banner on the compare tab so the pitch fits the user's moment.
  const order = plans.map((p) => p.id);
  const recommended =
    usage.over_limit || nearLimit
      ? plans
          .slice(order.indexOf(plan.id) + 1)
          .find((p) => p.price !== null && (p.monthly_quota === -1 || p.monthly_quota > usage.quota))
      : undefined;

  const usageSlot = (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {plan.name} plan
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {usage.period}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {usage.used.toLocaleString()} / {usage.quota.toLocaleString()} emails
            </span>
            <span className="text-muted-foreground">
              {usage.over_limit
                ? plan.allow_overage
                  ? `${usage.overage.toLocaleString()} over · ~$${usage.overage_cost.toFixed(2)} overage`
                  : "Limit reached"
                : `${usage.remaining.toLocaleString()} left`}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          {usage.over_limit && !plan.allow_overage ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                You&apos;ve hit your monthly limit — upgrade to keep sending.
              </p>
              <Link href="/billing?tab=plans" className={cn(buttonVariants({ size: "sm" }))}>
                Compare plans <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          ) : nearLimit ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                You&apos;re at {pct}% of your monthly quota.
              </p>
              <Link
                href="/billing?tab=plans"
                className="inline-flex items-center text-sm font-medium text-primary hover:underline"
              >
                See plans <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What you&apos;ll be billed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.custom ? (
              <p className="text-sm text-muted-foreground">
                Custom pricing — contact sales for your invoice.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {summary.lines.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-muted-foreground">{l.label}</span>
                      <span className="font-medium">${l.amount.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="font-semibold">Estimated total / mo</span>
                  <span className="font-semibold">${summary.total.toFixed(2)}</span>
                </div>
                {summary.yearly_option ? (
                  <p className="text-xs text-muted-foreground">
                    Pay yearly: ${summary.yearly_option.plan_amount}/yr (~$
                    {summary.yearly_option.equivalent_monthly}/mo) — save $
                    {summary.yearly_option.savings_vs_monthly} on the plan.
                  </p>
                ) : null}
                {billing.billing_mode === "local" ? (
                  <p className="text-xs text-muted-foreground">Demo billing — no card is charged.</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seats &amp; add-ons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {summary.seats.capacity === -1
                ? `${summary.seats.used} seats in use · unlimited included.`
                : `${summary.seats.used} of ${summary.seats.capacity} seats in use (${summary.seats.included} included${summary.seats.purchased ? ` + ${summary.seats.purchased} purchased` : ""}).`}
            </p>
            <AddonManager quantities={addonQty} catalog={addons_catalog} />
          </CardContent>
        </Card>
      </div>
    </>
  );

  const plansSlot = (
    <>
      {recommended ? (
        <div className="mb-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {usage.over_limit
                  ? "You've hit your monthly limit."
                  : `You're at ${pct}% of your quota.`}{" "}
                {recommended.name} gives you{" "}
                {recommended.monthly_quota === -1
                  ? "unlimited"
                  : recommended.monthly_quota.toLocaleString()}{" "}
                sends/mo
                {recommended.ai_credits
                  ? ` and ${recommended.ai_credits === -1 ? "unlimited" : recommended.ai_credits} AI credits`
                  : ""}
                .
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Recommended for your usage.</p>
            </div>
            <Link
              href={`/billing/checkout?plan=${recommended.id}&interval=month`}
              className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
            >
              Upgrade to {recommended.name} <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Do more with rootmail</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          You&apos;re on the {plan.name} plan. Upgrade for more monthly sends, AI assistant credits, team
          seats, and deliverability tools — prorated instantly, change or cancel anytime.
        </p>
      </div>

      <PlanCards plans={plans} currentId={plan.id} />

      <div className="mt-4 rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold">Every plan includes</p>
        <ul className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Full REST API & Node SDK",
            "Append-only audit trail",
            "Automatic suppression handling",
            "Webhooks & delivery events",
            "Sandbox (test-mode) keys",
            "Usage-based billing — pay for what you send",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Have a promo code? Enter it at checkout to apply your discount.
      </p>
    </>
  );

  return (
    <>
      <PageHeader
        title="Plan & usage"
        description="Live sends count against your monthly quota. Sandbox (test mode) is always free."
      />
      <BillingTabs initialTab={initialTab} usage={usageSlot} plans={plansSlot} />
    </>
  );
}
