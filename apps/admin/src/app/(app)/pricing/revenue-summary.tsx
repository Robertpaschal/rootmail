import { CreditCard, Gauge, Package, TrendingUp, Users, Zap } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { formatNumber } from "@/lib/format";
import type { AdminAnalytics } from "@/lib/types";

// The wing-era revenue streams — each product line's contribution.
const STREAMS: { key: "transactional" | "marketing" | "addons" | "custom"; label: string; color: string; note: string }[] = [
  { key: "transactional", label: "Transactional", color: "bg-violet-500", note: "send blocks" },
  { key: "marketing", label: "Marketing", color: "bg-blue-500", note: "contact-size tiers" },
  { key: "addons", label: "Add-ons", color: "bg-emerald-500", note: "seats, packs, IPs…" },
  { key: "custom", label: "Custom", color: "bg-amber-500", note: "bespoke subs" },
];

/** Revenue at a glance on the pricing page — recurring revenue by product line
 * (wings + add-ons + custom), overage, subscribers, ARPA, and an MRR trend — so
 * pricing reads as revenue management, not just a catalog of editable forms. */
export function RevenueSummary({ analytics }: { analytics: AdminAnalytics }) {
  const r = analytics.revenue;
  const paid = analytics.orgs.paid;
  const streams = STREAMS.map((s) => ({ ...s, rev: r.by_stream?.[s.key] ?? 0 }));
  const maxRev = Math.max(1, ...streams.map((s) => s.rev));
  const trend = r.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((t) => t.mrr));

  const tiles: { label: string; value: string; sub?: string; icon: typeof CreditCard; tone: "green" | "blue" | "violet" }[] = [
    { label: "Wing MRR", value: `$${formatNumber(r.mrr_estimate)}`, sub: "blocks + contact tiers + custom", icon: CreditCard, tone: "green" },
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
          <h3 className="text-sm font-semibold">Revenue by stream · {analytics.period}</h3>
          <div className="mt-3 space-y-3">
            {streams.map((s) => {
              const total = r.total_recurring > 0 ? r.total_recurring : 1;
              const share = Math.round((s.rev / total) * 100);
              return (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {s.label}
                      <span className="ml-1.5 font-normal text-muted-foreground">{s.note}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      ${formatNumber(s.rev)}/mo · {share}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${Math.round((s.rev / maxRev) * 100)}%` }}
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
