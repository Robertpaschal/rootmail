import type { Metadata } from "next";
import { Building2, CreditCard, Gauge, Mail, Sparkles, TrendingUp } from "lucide-react";
import { StatCard, type Tone } from "@/components/app/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

const PLAN_ORDER = ["free", "pro", "scale", "enterprise"];
const PLAN_COLOR: Record<string, string> = {
  free: "bg-slate-400",
  pro: "bg-blue-500",
  scale: "bg-violet-500",
  enterprise: "bg-amber-500",
};
// Deliverability outcomes read by color: good = green, bad = rose/amber, in-flight = blue.
const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-emerald-500",
  opened: "bg-violet-500",
  clicked: "bg-blue-500",
  sent: "bg-blue-400",
  queued: "bg-slate-400",
  bounced: "bg-rose-500",
  complained: "bg-amber-500",
  failed: "bg-rose-600",
  suppressed: "bg-amber-600",
};

export default async function AnalyticsPage() {
  const a = await adminApi.analytics();

  const stats: { label: string; value: string; icon: typeof Mail; tone: Tone }[] = [
    { label: "MRR (estimate)", value: `$${formatNumber(a.revenue.mrr_estimate)}`, icon: CreditCard, tone: "green" },
    { label: "Paid orgs", value: formatNumber(a.orgs.paid), icon: Building2, tone: "blue" },
    { label: "Emails this period", value: formatNumber(a.volume.emails_this_period), icon: Mail, tone: "violet" },
    { label: "AI credits this period", value: formatNumber(a.ai.credits_this_period), icon: Sparkles, tone: "amber" },
    { label: "New orgs (30d)", value: formatNumber(a.growth.new_orgs_30d), icon: TrendingUp, tone: "blue" },
    { label: "Delivered rate", value: `${a.deliverability.delivered_rate}%`, icon: Gauge, tone: "green" },
  ];

  const planMax = Math.max(1, ...PLAN_ORDER.map((p) => a.orgs.by_plan[p] ?? 0));
  const trendMax = Math.max(1, ...a.volume.trend.map((t) => t.emails));
  const statusEntries = Object.entries(a.deliverability.by_status).sort((x, y) => y[1] - x[1]);
  const statusMax = Math.max(1, ...statusEntries.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Platform-wide metrics · period {a.period}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {PLAN_ORDER.map((p) => (
              <BarRow
                key={p}
                label={p}
                value={a.orgs.by_plan[p] ?? 0}
                max={planMax}
                barClass={PLAN_COLOR[p]}
                suffix={a.revenue.by_plan[p] ? `$${a.revenue.by_plan[p]}/mo` : undefined}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deliverability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No live messages sent yet.</p>
            ) : (
              statusEntries.map(([s, n]) => (
                <BarRow key={s} label={s} value={n} max={statusMax} barClass={STATUS_COLOR[s] ?? "bg-primary"} />
              ))
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">
                Delivered {a.deliverability.delivered_rate}%
              </span>
              <span className="text-rose-600 dark:text-rose-400">Bounced {a.deliverability.bounce_rate}%</span>
              <span className="text-amber-600 dark:text-amber-400">
                Complaints {a.deliverability.complaint_rate}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email volume · last {a.volume.trend.length} period(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.volume.trend.map((t) => (
            <BarRow key={t.period} label={t.period} value={t.emails} max={trendMax} barClass="bg-blue-500" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  suffix,
  barClass = "bg-primary",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  barClass?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium capitalize">
          {label}
          {suffix ? <span className="ml-1.5 font-normal text-muted-foreground">{suffix}</span> : null}
        </span>
        <span className="tabular-nums text-muted-foreground">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
