import { AlertTriangle, CheckCircle2, Info, Lightbulb, ShieldCheck } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Deliverability, DeliverabilityFactor } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  Deliverability["status"],
  { label: string; text: string; bar: string }
> = {
  excellent: { label: "Excellent", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  good: { label: "Good", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  at_risk: { label: "At risk", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  critical: { label: "Critical", text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
  no_data: { label: "No data yet", text: "text-muted-foreground", bar: "bg-muted-foreground/40" },
};

const severityBadge: Record<DeliverabilityFactor["severity"], "destructive" | "warning" | "secondary"> = {
  critical: "destructive",
  warning: "warning",
  info: "secondary",
};

function rateTone(value: number, warn: number, crit: number): string {
  if (value >= crit) return "text-red-600 dark:text-red-400";
  if (value >= warn) return "text-amber-600 dark:text-amber-400";
  return "text-foreground";
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function DeliverabilityPage() {
  let d: Deliverability;
  try {
    d = await api.getDeliverability();
  } catch (err) {
    return (
      <>
        <PageHeader title="Deliverability" description="Your sender reputation from real delivery outcomes." />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const meta = STATUS_META[d.status];
  const rates = [
    { label: "Delivery rate", value: d.rates.delivery, tone: "text-foreground", suffix: "higher is better" },
    { label: "Bounce rate", value: d.rates.bounce, tone: rateTone(d.rates.bounce, 2, 5), suffix: "target < 2%" },
    { label: "Complaint rate", value: d.rates.complaint, tone: rateTone(d.rates.complaint, 0.1, 0.3), suffix: "target < 0.1%" },
    { label: "Failure rate", value: d.rates.failure, tone: rateTone(d.rates.failure, 1, 5), suffix: "send errors" },
  ];

  return (
    <>
      <PageHeader
        title="Deliverability"
        description={`Your sender reputation from real delivery outcomes over the last ${d.window_days} days.`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Score */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Reputation score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <span className={cn("text-5xl font-bold tabular-nums", meta.text)}>
                {d.score ?? "—"}
              </span>
              {d.score !== null ? <span className="pb-1.5 text-lg text-muted-foreground">/ 100</span> : null}
              {d.grade ? (
                <Badge variant="outline" className="mb-2 ml-auto text-base">
                  {d.grade}
                </Badge>
              ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${d.score ?? 0}%` }} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={cn("font-medium", meta.text)}>{meta.label}</span>
              {d.confidence === "low" ? <span className="text-xs text-muted-foreground">low confidence</span> : null}
            </div>
          </CardContent>
        </Card>

        {/* Rates */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {rates.map((r) => (
                <div key={r.label}>
                  <div className={cn("text-2xl font-semibold tabular-nums", r.tone)}>{r.value}%</div>
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.suffix}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Factors */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">What&apos;s affecting your score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.factors.map((f) => {
              const Icon = f.severity === "critical" ? AlertTriangle : f.severity === "warning" ? AlertTriangle : CheckCircle2;
              return (
                <div key={f.id} className="flex items-start gap-3">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      f.severity === "critical"
                        ? "text-red-600 dark:text-red-400"
                        : f.severity === "warning"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      <Badge variant={severityBadge[f.severity]} className="text-[10px]">
                        {f.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{f.detail}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to do — keep it up.</p>
            ) : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {d.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Volume */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Volume (last {d.window_days} days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Total" value={d.volume.total} />
              <Stat label="Delivered" value={d.volume.delivered} />
              <Stat label="Bounced" value={d.volume.bounced} />
              <Stat label="Complained" value={d.volume.complained} />
              <Stat label="Failed" value={d.volume.failed} />
              <Stat label="In flight" value={d.volume.in_flight} />
            </div>
          </CardContent>
        </Card>

        {/* Hygiene: suppressions + domains */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-muted-foreground" />
              List &amp; domain health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Suppressed addresses</span>
              <span className="font-medium tabular-nums">{d.suppressions.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">— from bounces</span>
              <span className="tabular-nums">{d.suppressions.by_reason.bounce ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">— from complaints</span>
              <span className="tabular-nums">{d.suppressions.by_reason.complaint ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground">Verified sending domains</span>
              <span className="font-medium tabular-nums">
                {d.domains.verified} / {d.domains.total}
              </span>
            </div>
            {d.domains.unverified > 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {d.domains.unverified} domain(s) need DKIM verification.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
