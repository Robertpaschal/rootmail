import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics" };

const PLAN_ORDER = ["free", "pro", "scale", "enterprise"];

export default async function AnalyticsPage() {
  const a = await adminApi.analytics();

  const stats = [
    { label: "MRR (estimate)", value: `$${formatNumber(a.revenue.mrr_estimate)}` },
    { label: "Paid orgs", value: formatNumber(a.orgs.paid) },
    { label: "Emails this period", value: formatNumber(a.volume.emails_this_period) },
    { label: "AI credits this period", value: formatNumber(a.ai.credits_this_period) },
    { label: "New orgs (30d)", value: formatNumber(a.growth.new_orgs_30d) },
    { label: "Delivered rate", value: `${a.deliverability.delivered_rate}%` },
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
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
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
              statusEntries.map(([s, n]) => <BarRow key={s} label={s} value={n} max={statusMax} />)
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
              <span>Delivered {a.deliverability.delivered_rate}%</span>
              <span>Bounced {a.deliverability.bounce_rate}%</span>
              <span>Complaints {a.deliverability.complaint_rate}%</span>
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
            <BarRow key={t.period} label={t.period} value={t.emails} max={trendMax} />
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
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
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
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
