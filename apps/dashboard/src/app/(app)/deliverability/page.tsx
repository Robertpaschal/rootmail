import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Lightbulb,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { SuppressionsImport } from "./suppressions-import";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Deliverability, DeliverabilityFactor } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  Deliverability["status"],
  { label: string; text: string; bar: string; verdict: string }
> = {
  excellent: {
    label: "Excellent",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    verdict: "Mail is landing reliably in inboxes. Keep doing what you're doing.",
  },
  good: {
    label: "Good",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    verdict: "Mail is landing well. A few tweaks below will keep it that way.",
  },
  at_risk: {
    label: "At risk",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    verdict: "Inbox placement is slipping. Address the flagged issues before it worsens.",
  },
  critical: {
    label: "Needs attention",
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
    verdict: "Providers may be filtering or blocking your mail. Act on the critical items now.",
  },
  no_data: { label: "No data yet", text: "text-muted-foreground", bar: "bg-muted-foreground/40", verdict: "" },
};

const severityBadge: Record<DeliverabilityFactor["severity"], "destructive" | "warning" | "secondary"> = {
  critical: "destructive",
  warning: "warning",
  info: "secondary",
};

// The four things that decide whether mail reaches the inbox — the deliverability
// "story". Each links to where you actually act on it (all real routes).
const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Authenticate",
    body: "SPF, DKIM and DMARC prove the mail is really from you. Verify your sending domain so mailbox providers trust it.",
    href: "/settings/sender",
    cta: "Set up sending",
  },
  {
    icon: TrendingUp,
    title: "Build reputation",
    body: "Send steady volume from a stable identity. Sudden spikes from a cold sender look like spam and get throttled.",
    href: null,
    cta: null,
  },
  {
    icon: Sparkles,
    title: "Keep lists clean",
    body: "We auto-suppress bounces and complaints so you never re-hit a bad address. Bring your own suppression list too.",
    href: "/deliverability?import=suppressions",
    cta: "Import suppressions",
  },
  {
    icon: MousePointerClick,
    title: "Earn engagement",
    body: "Opens and clicks tell providers your mail is wanted. Target the right people with content they asked for.",
    href: "/analytics",
    cta: "See engagement",
  },
] as const;

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

/** The dedicated-IP add-on's status — shown whether or not there's send data yet,
 * so a just-purchased IP is acknowledged immediately (not hidden until first send). */
function DedicatedIpBanner({
  status,
  address,
}: {
  status: "none" | "provisioning" | "active" | string;
  address?: string | null;
}) {
  if (status === "none") return null;
  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="flex items-center gap-2 font-medium">
            Dedicated IP
            <Badge variant={status === "active" ? "success" : "warning"}>
              {status === "active" ? "Active" : "Provisioning"}
            </Badge>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {status === "active"
              ? `Your mail sends from a dedicated IP${address ? ` (${address})` : ""} — reputation you own.`
              : "Your dedicated IP is being set up by our team. We'll email you when it's live, then warm it gradually (usually 1–2 business days to start)."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PillarCard({ p }: { p: (typeof PILLARS)[number] }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <span className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <p.icon className="size-4" />
        </span>
        <p className="text-sm font-semibold">{p.title}</p>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
        {p.href ? (
          <Link
            href={p.href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {p.cta} <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function DeliverabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const sp = await searchParams;
  const importOpen = sp.import === "suppressions";
  let d: Deliverability;
  try {
    d = await api.getDeliverability();
  } catch (err) {
    return (
      <>
        <PageHeader title="Deliverability" description="How reliably your email reaches inboxes — and what to fix when it doesn't." />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  // Best-effort: the dedicated-IP add-on's provisioning status, if purchased.
  const org = await api.getOrganization().catch(() => null);
  const dip = org?.dedicated_ip_status ?? "none";
  const meta = STATUS_META[d.status];
  const noData = d.status === "no_data" || d.volume.total === 0;

  // Before the first send there's nothing to measure — so teach the model instead
  // of showing a dashboard of zeros.
  if (noData) {
    return (
      <>
        <PageHeader
          title="Deliverability"
          description="How reliably your email reaches inboxes — and what to do to keep it landing there."
        />
        <Reveal className="space-y-8">
          {dip !== "none" ? <DedicatedIpBanner status={dip} address={org?.dedicated_ip_address} /> : null}
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="Your deliverability picture builds as you send"
            description="Once mail starts flowing we score your sending reputation from real delivery, bounce, complaint and engagement signals — and tell you exactly what to fix. Here's what shapes it:"
            action={
              <Link
                href="/settings/sender"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Verify your sending domain <ArrowRight className="size-4" />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <PillarCard key={p.title} p={p} />
            ))}
          </div>
          {/* Migrating? The old provider's "never email these" list comes first. */}
          <SuppressionsImport defaultOpen={importOpen} />
        </Reveal>
      </>
    );
  }

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
        description={`Measured from your real sends over the last ${d.window_days} days.`}
      />

      {dip !== "none" ? (
        <Reveal className="mb-6 block">
          <DedicatedIpBanner status={dip} address={org?.dedicated_ip_address} />
        </Reveal>
      ) : null}

      {/* Hero verdict — the score, in plain English, up top. */}
      <Reveal>
        <Card className="mb-6 overflow-hidden">
          <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
            <div className="flex items-end gap-3 sm:w-56 sm:shrink-0 sm:flex-col sm:items-start sm:gap-2">
              <div className="flex items-end gap-2">
                <span className={cn("text-6xl font-bold leading-none tabular-nums", meta.text)}>{d.score ?? "—"}</span>
                {d.score !== null ? <span className="pb-1.5 text-lg text-muted-foreground">/ 100</span> : null}
                {d.grade ? (
                  <Badge variant="outline" className="mb-1 text-base">
                    {d.grade}
                  </Badge>
                ) : null}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${d.score ?? 0}%` }} />
              </div>
            </div>
            <div className="min-w-0 flex-1 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span>Your sending reputation is</span>
                <span className={meta.text}>{meta.label.toLowerCase()}</span>
                {d.confidence === "low" ? (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    low confidence — send more to be sure
                  </Badge>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{meta.verdict}</p>
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Rates */}
      <Reveal delay={0.05}>
        <Card className="mb-6">
          <CardHeader className="pb-2">
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
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Factors */}
        <Reveal delay={0.1} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">What&apos;s affecting your score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.factors.map((f) => {
                const Icon = f.severity === "info" ? CheckCircle2 : AlertTriangle;
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
        </Reveal>

        {/* Recommendations */}
        <Reveal delay={0.15} className="lg:col-span-1">
          <Card className="h-full">
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
        </Reveal>

        {/* Volume */}
        <Reveal delay={0.2} className="lg:col-span-2">
          <Card className="h-full">
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
        </Reveal>

        {/* Hygiene: suppressions + domains */}
        <Reveal delay={0.25} className="lg:col-span-1">
          <Card className="h-full">
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
                <Link
                  href="/settings/sender"
                  className="flex items-start gap-1.5 text-xs text-amber-600 hover:underline dark:text-amber-400"
                >
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {d.domains.unverified} domain(s) need DKIM verification — finish set-up
                </Link>
              ) : null}
              <div className="border-t pt-3">
                <SuppressionsImport defaultOpen={importOpen} />
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {/* The story, always in reach: the four levers of inbox placement. */}
      <Reveal delay={0.3}>
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">What moves inbox placement</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <PillarCard key={p.title} p={p} />
            ))}
          </div>
        </div>
      </Reveal>
    </>
  );
}
