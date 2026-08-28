import type { Metadata } from "next";
import { Building2, CreditCard, Gauge, Mail, Sparkles, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

// Customer mix + revenue read in wing-era terms (what orgs actually hold/pay).
// A wing is a category, not a state — so it is told apart by its label and its
// number, per §9.7, and its bar is ink.
const MIX_ROWS: { key: "free" | "transactional" | "marketing" | "both_wings" | "custom"; label: string; stream?: "transactional" | "marketing" | "custom" }[] = [
  { key: "free", label: "Free" },
  { key: "transactional", label: "Transactional", stream: "transactional" },
  { key: "marketing", label: "Marketing", stream: "marketing" },
  { key: "both_wings", label: "Both wings" },
  { key: "custom", label: "Custom", stream: "custom" },
];

/**
 * Deliverability outcomes, drawn under the rendering law rather than by mood.
 *
 * The old map graded these on a good/bad axis — green for delivered, violet for
 * opened, two shades of rose for bounced and failed, two of amber for
 * complained and suppressed — which put an OPEN, a tracking pixel firing, in
 * the same solid weight as a provider's delivery confirmation. Here the bar
 * says how we know:
 *
 *   witnessed  the provider told us (delivered, sent)
 *   inferred   a pixel fired (opened, clicked) — drawn hollow, outline only
 *   acted      we intervened (suppressed)
 *   stopped    it ended (bounced, complained, failed)
 *   unknown    still in flight (queued)
 */
type Claim = "witnessed" | "inferred" | "acted" | "stopped" | "unknown";

const STATUS_CLAIM: Record<string, Claim> = {
  delivered: "witnessed",
  sent: "witnessed",
  opened: "inferred",
  clicked: "inferred",
  queued: "unknown",
  bounced: "stopped",
  complained: "stopped",
  failed: "stopped",
  suppressed: "acted",
};

const BAR: Record<Claim, string> = {
  witnessed: "bg-witnessed",
  // Hollow, exactly as an inferred station is: an outline with no fill, so a
  // guess can never be mistaken for an observation at a glance.
  inferred: "border border-ink/50 bg-transparent",
  acted: "bg-acted",
  stopped: "bg-stopped",
  unknown: "bg-ink-muted/40",
};

export default async function AnalyticsPage() {
  const a = await adminApi.analytics();

  const mixMax = Math.max(1, ...MIX_ROWS.map((m) => a.orgs.mix[m.key] ?? 0));
  const trendMax = Math.max(1, ...a.volume.trend.map((t) => t.emails));
  const statusEntries = Object.entries(a.deliverability.by_status).sort((x, y) => y[1] - x[1]);
  const statusMax = Math.max(1, ...statusEntries.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-heading">Analytics</h1>
        <p className="font-mono text-xs text-muted-foreground">
          every organization · period {a.period}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="recurring revenue" value={`$${formatNumber(a.revenue.mrr_estimate)}`} window="this period" method="wing + add-on subscriptions" caveat="estimate" icon={CreditCard} />
        <StatCard label="paid orgs" value={formatNumber(a.orgs.paid)} window="now" method="orgs table" icon={Building2} />
        <StatCard label="emails" value={formatNumber(a.volume.emails_this_period)} window="this period" method="api+worker" icon={Mail} />
        <StatCard label="ai credits" value={formatNumber(a.ai.credits_this_period)} window="this period" method="assistant runs" icon={Sparkles} />
        <StatCard label="new orgs" value={formatNumber(a.growth.new_orgs_30d)} window="30d" method="orgs table" icon={TrendingUp} />
        <StatCard
          label="delivered"
          value={`${a.deliverability.delivered_rate}%`}
          window="this period"
          method="provider feedback"
          caveat={a.deliverability.tests_excluded > 0 ? `${a.deliverability.tests_excluded.toLocaleString()} test sends excluded` : undefined}
          icon={Gauge}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer mix</CardTitle>
            <p className="font-mono text-[11px] text-muted-foreground">
              organizations · now · what each org holds
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {MIX_ROWS.map((m) => (
              <BarRow
                key={m.key}
                label={m.label}
                value={a.orgs.mix[m.key] ?? 0}
                max={mixMax}
                suffix={m.stream && a.revenue.by_stream[m.stream] ? `$${a.revenue.by_stream[m.stream]}/mo` : undefined}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What happened to the mail</CardTitle>
            <p className="font-mono text-[11px] text-muted-foreground">
              messages · this period · provider feedback + tracking pixel
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has left the platform this period. The first live send appears here within
                seconds of the provider accepting it.
              </p>
            ) : (
              statusEntries.map(([s, n]) => (
                <BarRow key={s} label={s} value={n} max={statusMax} claim={STATUS_CLAIM[s] ?? "unknown"} />
              ))
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 font-mono text-[11px]">
              <span className="text-witnessed">delivered {a.deliverability.delivered_rate}%</span>
              <span className="text-stopped">bounced {a.deliverability.bounce_rate}% · SES suspends at 5%</span>
              <span className="text-acted">complaints {a.deliverability.complaint_rate}% · SES suspends at 0.5%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email volume</CardTitle>
          <p className="font-mono text-[11px] text-muted-foreground">
            messages · last {a.volume.trend.length} period(s) · api+worker
          </p>
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
  claim,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  /** Omit for a plain quantity. Pass one only where the row IS a state. */
  claim?: Claim;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium capitalize">
          {label}
          {suffix ? <span className="ml-1.5 font-normal text-muted-foreground">{suffix}</span> : null}
          {claim === "inferred" ? (
            <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
              inferred · tracking pixel
            </span>
          ) : null}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden bg-secondary">
        <div className={cn("h-full", claim ? BAR[claim] : "bg-ink")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
