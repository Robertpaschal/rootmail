import { CreditCard, Gauge, Package, TrendingUp, Users, Zap } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { formatNumber } from "@/lib/format";
import type { AdminAnalytics } from "@/lib/types";

const PAID_PLANS = ["pro", "scale", "enterprise"] as const;
const PLAN_COLOR: Record<string, string> = {
  pro: "bg-blue-500",
  scale: "bg-violet-500",
  enterprise: "bg-amber-500",
};

/** Revenue at a glance on the pricing page — recurring revenue (plan + add-ons),
 * overage, subscribers, ARPA, a per-plan contribution breakdown, and an MRR trend —
 * so pricing reads as revenue management, not just a catalog of editable forms. */
export function RevenueSummary({ analytics }: { analytics: AdminAnalytics }) {
  const r = analytics.revenue;
  const paid = analytics.orgs.paid;
  const countByPlan = analytics.orgs.by_plan;
  const maxRev = Math.max(1, ...PAID_PLANS.map((p) => r.by_plan[p] ?? 0));
  const trend = r.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((t) => t.mrr));

  const tiles: { label: string; value: string; sub?: string; icon: typeof CreditCard; tone: "green" | "blue" | "violet" }[] = [
    { label: "Plan MRR", value: `$${formatNumber(r.mrr_estimate)}`, sub: "active paid subs", icon: CreditCard, tone: "green" },
    { label: "Add-on MRR", value: `$${formatNumber(r.addon_mrr)}`, sub: "seats, packs, IPs", icon: Package, tone: "green" },
    { label: "Overage", value: `$${formatNumber(r.overage)}`, sub: `this period`, icon: Zap, tone: "green" },
    { label: "ARR (run-rate)", value: `$${formatNumber(r.arr)}`, sub: "recurring × 12", icon: TrendingUp, tone: "green" },
    { label: "Paid subscribers", value: formatNumber(paid), icon: Users, tone: "blue" },
    { label: "ARPA", value: `$${formatNumber(r.arpa)}/mo`, sub: "avg revenue / account", icon: Gauge, tone: "violet" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <StatCard key={t.label} label={t.label} value={t.value} sub={t.sub} icon={t.icon} tone={t.tone} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Revenue by plan · {analytics.period}</h3>
          <div className="mt-3 space-y-3">
            {PAID_PLANS.map((p) => {
              const rev = r.by_plan[p] ?? 0;
              const count = countByPlan[p] ?? 0;
              const custom = p === "enterprise";
              const share = r.mrr_estimate > 0 ? Math.round((rev / r.mrr_estimate) * 100) : 0;
              return (
                <div key={p}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">
                      {p}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {count} sub{count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {custom ? "custom pricing" : `$${formatNumber(rev)}/mo${r.mrr_estimate > 0 ? ` · ${share}%` : ""}`}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${PLAN_COLOR[p]}`}
                      style={{ width: `${custom ? 0 : Math.round((rev / maxRev) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">MRR trend</h3>
            <span className="text-xs text-muted-foreground">estimate · by signup month</span>
          </div>
          <div className="mt-4 flex items-end gap-2">
            {trend.map((t) => {
              const h = Math.max(4, Math.round((t.mrr / trendMax) * 84));
              return (
                <div key={t.period} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    ${formatNumber(t.mrr)}
                  </span>
                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${h}px` }} />
                  <span className="text-[10px] text-muted-foreground">{t.period.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
