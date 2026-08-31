import { CreditCard, Gauge, Package, TrendingUp, Users, Zap } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { formatNumber } from "@/lib/format";
import type { AdminAnalytics } from "@/lib/types";

// The wing-era revenue streams — each product line's contribution.
//
// A revenue stream is a category, not a state: nothing about "add-ons" was
// witnessed, acted on or stopped. It used to carry four saturated bars anyway,
// which is how a console ends up with no colour left for the one row that
// genuinely means "we suspended a customer". The bars are ink; the label and
// the share carry the difference (§9.7).
const STREAMS: { key: "transactional" | "marketing" | "addons" | "custom"; label: string; note: string }[] = [
  { key: "transactional", label: "Transactional", note: "send blocks" },
  { key: "marketing", label: "Marketing", note: "contact-size tiers" },
  { key: "addons", label: "Add-ons", note: "seats, packs, IPs" },
  { key: "custom", label: "Custom", note: "bespoke subs" },
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

  const tiles: {
    label: string;
    value: string;
    window: string;
    method: string;
    caveat?: string;
    icon: typeof CreditCard;
  }[] = [
    { label: "wing revenue", value: `$${formatNumber(r.mrr_estimate)}`, window: "this period", method: "blocks + contact tiers + custom", icon: CreditCard },
    { label: "add-on revenue", value: `$${formatNumber(r.addon_mrr)}`, window: "this period", method: "seats, packs, IPs", icon: Package },
    { label: "overage", value: `$${formatNumber(r.overage)}`, window: "this period", method: "metered sends past the block", icon: Zap },
    { label: "run-rate", value: `$${formatNumber(r.arr)}`, window: "12mo", method: "recurring × 12", caveat: "assumes nobody churns", icon: TrendingUp },
    { label: "paid subscribers", value: formatNumber(paid), window: "now", method: "orgs with a live subscription", icon: Users },
    { label: "revenue per account", value: `$${formatNumber(r.arpa)}/mo`, window: "this period", method: "recurring ÷ paid orgs", icon: Gauge },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <StatCard
            key={t.label}
            label={t.label}
            value={t.value}
            window={t.window}
            method={t.method}
            caveat={t.caveat}
            icon={t.icon}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium tracking-heading">Revenue by stream</h3>
          <p className="mt-0.5 font-mono text-[12.5px] text-muted-foreground">
            dollars · {analytics.period} · what each org holds
          </p>
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
                  <div className="h-2 w-full overflow-hidden bg-secondary">
                    <div
                      className="h-full bg-ink"
                      style={{ width: `${Math.round((s.rev / maxRev) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium tracking-heading">Recurring revenue over time</h3>
            <span className="font-mono text-[12.5px] text-muted-foreground">
              dollars · by signup month · estimate
            </span>
          </div>
          <div className="mt-4 flex items-end gap-2">
            {trend.map((t) => {
              const h = Math.max(4, Math.round((t.mrr / trendMax) * 84));
              return (
                <div key={t.period} className="flex flex-1 flex-col items-center gap-1">
                  <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                    ${formatNumber(t.mrr)}
                  </span>
                  <div className="w-full bg-ink" style={{ height: `${h}px` }} />
                  <span className="text-[12px] text-muted-foreground">{t.period.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
