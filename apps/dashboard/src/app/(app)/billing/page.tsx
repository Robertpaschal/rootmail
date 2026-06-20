import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Billing } from "@/lib/types";
import { AddonManager } from "./addon-manager";
import { PlanCards } from "./plan-cards";

export default async function BillingPage() {
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

  const { plan, usage, plans, summary } = billing;
  const addonQty: Record<string, number> = {};
  for (const a of summary.add_ons) addonQty[a.id] = a.quantity;
  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  const barColor = usage.over_limit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary";

  return (
    <>
      <PageHeader
        title="Plan & usage"
        description="Live sends count against your monthly quota. Sandbox (test mode) is always free."
      />

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
            <p className="text-sm text-destructive">
              You&apos;ve hit your monthly limit — upgrade below to keep sending.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
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
            <AddonManager quantities={addonQty} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold">Plans</h2>
      <PlanCards plans={plans} currentId={plan.id} />
      <p className="mt-3 text-xs text-muted-foreground">
        Have a promo code? Enter it at checkout to apply your discount.
      </p>
    </>
  );
}
