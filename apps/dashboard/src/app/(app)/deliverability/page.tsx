import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Fact } from "@rootmail/design";
import { SuppressionsImport } from "./suppressions-import";
import { VolumeBar } from "./volume-bar";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { RateScale } from "@/components/app/rate-scale";
import { TrendChart } from "@/components/app/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Deliverability, DeliverabilityFactor } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * THE SHAPE OF THIS PAGE.
 *
 * Deliverability is one thing: a number moving against rules somebody else
 * published. It was eight cards of numbers-with-a-grey-target-underneath, which
 * answers "do you currently disapprove of me" and never answers "how much room
 * do I have" — the only question an operator actually arrives with.
 *
 * So the page is a scale, twice. `RateScale` (built, and until now wired to
 * nothing) draws the operator's real bounce and complaint rate on an axis with
 * OUR thresholds and the PROVIDER's ceiling marked on it, and lets them drag
 * the handle to see where the next consequence starts. Everything else on the
 * page is arranged around that: the verdict above it, the composition of the
 * sending under it, and the levers last as a ruled list rather than a fourth
 * grid of tiles.
 */

const STATUS_META: Record<
  Deliverability["status"],
  { label: string; text: string; bar: string; verdict: string }
> = {
  excellent: {
    label: "Excellent",
    text: "text-witnessed",
    bar: "bg-witnessed",
    verdict: "Mail is landing reliably in inboxes. Keep doing what you're doing.",
  },
  good: {
    label: "Good",
    text: "text-witnessed",
    bar: "bg-witnessed",
    verdict: "Mail is landing well. A few tweaks below will keep it that way.",
  },
  at_risk: {
    label: "At risk",
    text: "text-acted",
    bar: "bg-acted",
    verdict: "Inbox placement is slipping. Address the flagged issues before it worsens.",
  },
  critical: {
    label: "Needs attention",
    text: "text-stopped",
    bar: "bg-stopped",
    verdict: "Providers may be filtering or blocking your mail. Act on the critical items now.",
  },
  no_data: { label: "No data yet", text: "text-muted-foreground", bar: "bg-muted-foreground/40", verdict: "" },
};

const severityBadge: Record<DeliverabilityFactor["severity"], "destructive" | "warning" | "secondary"> = {
  critical: "destructive",
  warning: "warning",
  info: "secondary",
};

// The four things that decide whether mail reaches the inbox. Each links to
// where you actually act on it (all real routes).
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
    href: "/analytics?scope=all",
    cta: "Watch your volume trend",
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

/** One lever, as a ruled row. Four bordered tiles is the shape this product
 *  reaches for by default and it is what makes every page the same page. */
function Lever({
  p,
}: {
  p: {
    icon: (typeof PILLARS)[number]["icon"];
    title: string;
    body: string;
    href: string | null;
    cta: string | null;
    /** YOUR current standing on this lever — makes the row about the user, not theory. */
    state?: string;
    stateTone?: "good" | "warn";
  };
}) {
  return (
    <li className="grid gap-x-5 gap-y-1 border-t border-rule py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline">
      <p className="flex items-center gap-2 text-sm font-medium">
        <p.icon className="size-4 shrink-0 text-ink-muted" /> {p.title}
      </p>
      <div className="min-w-0">
        {p.state ? (
          <p
            className={cn(
              "font-mono text-[11px]",
              p.stateTone === "warn" ? "text-acted" : "text-witnessed",
            )}
            data-fact
          >
            {p.state}
          </p>
        ) : null}
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
      </div>
      {p.href && p.cta ? (
        <Link
          href={p.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {p.cta} <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </li>
  );
}

/** Section rule + title. Used instead of a Card wherever the content is not a
 *  discrete object but a part of one argument. */
function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      <div className="pt-5">{children}</div>
    </section>
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
          status={err instanceof ApiError ? err.status : undefined}
        />
      </>
    );
  }

  // Best-effort: the dedicated-IP add-on's provisioning status, if purchased.
  const org = await api.getOrganization().catch(() => null);
  const dip = org?.dedicated_ip_status ?? "none";
  // Daily outcomes for the health trend + the engagement pillar's real numbers.
  const trend = await api.getAnalytics({ window_days: d.window_days }).catch(() => null);
  const meta = STATUS_META[d.status];
  const noData = d.status === "no_data" || d.volume.total === 0;

  const levers = [
    {
      ...PILLARS[0],
      state:
        d.domains.total === 0
          ? "no sending domain yet"
          : `${d.domains.verified} of ${d.domains.total} domains verified · now · DNS lookup`,
      stateTone: (d.domains.total > 0 && d.domains.unverified === 0 ? "good" : "warn") as "good" | "warn",
      href: "/settings/sender",
      cta: d.domains.unverified > 0 || d.domains.total === 0 ? "Finish verification" : "Manage sending",
    },
    {
      ...PILLARS[1],
      state: `${d.volume.total.toLocaleString()} sent · ${d.window_days}d · api+worker`,
      stateTone: "good" as const,
    },
    {
      ...PILLARS[2],
      state: `${d.suppressions.total.toLocaleString()} address${d.suppressions.total === 1 ? "" : "es"} auto-blocked · all time · bounce + complaint feedback`,
      stateTone: "good" as const,
    },
    {
      ...PILLARS[3],
      state: trend
        ? `${Math.round(trend.rates.open)}% open · ${Math.round(trend.rates.click)}% click · ${d.window_days}d · tracking pixel · inferred`
        : undefined,
      stateTone: (trend && trend.rates.open >= 20 ? "good" : "warn") as "good" | "warn",
      href: "/analytics?scope=all",
      cta: "See engagement",
    },
  ];

  // Before the first send there's nothing to measure — so teach the rules
  // instead of showing a dashboard of zeros. The scales still draw: the
  // thresholds are published facts and are true before you have any numbers.
  if (noData) {
    return (
      <>
        <PageHeader
          title="Deliverability"
          description="How reliably your email reaches inboxes — and what to do to keep it landing there."
        />
        <Reveal className="space-y-10">
          {dip !== "none" ? <DedicatedIpBanner status={dip} address={org?.dedicated_ip_address} /> : null}
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="Your deliverability picture builds as you send"
            description="Once mail starts flowing we score your sending reputation from real delivery, bounce, complaint and engagement signals. The rules we score against are already fixed, though — so here they are before you send a thing."
            action={
              <Link
                href="/settings/sender"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Verify your sending domain <ArrowRight className="size-4" />
              </Link>
            }
          />

          <Section title="The two rates that get you throttled">
            {/* Full measure, stacked. `Scrub` positions its captions absolutely
                against the track, so two scales side by side collide their own
                labels — and these are the page's argument, not a sidebar. */}
            <div className="max-w-3xl space-y-12">
              <RateScale kind="bounce" actual={0} windowDays={d.window_days} />
              <RateScale kind="complaint" actual={0} windowDays={d.window_days} />
            </div>
          </Section>

          <Section title="What moves inbox placement">
            <ul className="-mt-5">
              {levers.map((p) => (
                <Lever key={p.title} p={p} />
              ))}
            </ul>
          </Section>

          {/* Migrating? The old provider's "never email these" list comes first. */}
          <SuppressionsImport defaultOpen={importOpen} />
        </Reveal>
      </>
    );
  }

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

      <Reveal className="space-y-10">
        {/* The verdict, as a sentence with a figure in it — not a hero tile.
            The score is a compression of the two rates below, so it introduces
            them rather than sitting in its own box above them. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-rule pb-6">
          <p className="flex items-baseline gap-2">
            <span className={cn("display-num text-6xl leading-none", meta.text)}>{d.score ?? "—"}</span>
            {d.score !== null ? <span className="text-lg text-muted-foreground">/ 100</span> : null}
            {d.grade ? (
              <Badge variant="outline" className="ml-1 text-base">
                {d.grade}
              </Badge>
            ) : null}
          </p>
          <div className="min-w-[16rem] flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-medium tracking-heading">
              <span>Your sending reputation is</span>
              <span className={meta.text}>{meta.label.toLowerCase()}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{meta.verdict}</p>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground" data-fact>
              {d.window_days}d · bounce + complaint + suppression mix · confidence: {d.confidence}
              {d.confidence === "low" ? " — send more before you trust it" : ""}
            </p>
          </div>
        </div>

        {/* THE SPINE OF THE PAGE. Two rates, drawn against the rules that act on
            them, with the operator's own number as the resting position of a
            handle they can drag. */}
        <Section
          title="The two rates that get you throttled"
          aside={
            <span className="font-mono text-[11px] text-muted-foreground" data-fact>
              delivery {d.rates.delivery}% · failures {d.rates.failure}% · {d.window_days}d
            </span>
          }
        >
          <div className="max-w-3xl space-y-12">
            <RateScale kind="bounce" actual={d.rates.bounce} windowDays={d.window_days} />
            <RateScale kind="complaint" actual={d.rates.complaint} windowDays={d.window_days} />
          </div>
        </Section>

        {/* Composition, as one bar. Six counts in six boxes made the reader do
            the division that is the entire point of the section. */}
        <Section
          title={`Where ${d.volume.total.toLocaleString()} messages went`}
          aside={
            <Link href="/messages" className="text-sm text-primary hover:underline">
              Open the register <ArrowRight className="inline size-3.5" />
            </Link>
          }
        >
          <VolumeBar volume={d.volume} windowDays={d.window_days} />
        </Section>

        {/* The trend — deliveries vs bounces, day by day. */}
        {trend && trend.series.some((s) => s.sent > 0) ? (
          <Section title="Delivery health · daily">
            <TrendChart
              dates={trend.series.map((s) => s.date)}
              series={[
                { label: "Sent", className: "text-muted-foreground/70", values: trend.series.map((s) => s.sent) },
                { label: "Delivered", className: "text-witnessed", values: trend.series.map((s) => s.delivered ?? 0) },
                { label: "Bounced / spam", className: "text-stopped", values: trend.series.map((s) => s.bounced ?? 0) },
              ]}
            />
          </Section>
        ) : null}

        {/* Factors and recommendations were two cards saying the same thing from
            two directions: what is wrong, and what to do. One list, each finding
            carrying its own remedy where we have one. */}
        <Section title="What's affecting your score">
          <ul className="divide-y divide-rule border-t border-rule">
            {d.factors.map((f) => {
              const Icon = f.severity === "info" ? CheckCircle2 : AlertTriangle;
              return (
                <li key={f.id} className="flex items-start gap-3 py-3.5">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      f.severity === "critical"
                        ? "text-stopped"
                        : f.severity === "warning"
                          ? "text-acted"
                          : "text-witnessed",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{f.label}</span>
                      <Badge variant={severityBadge[f.severity]} className="text-[10px]">
                        {f.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {d.recommendations.length > 0 ? (
            <ol className="mt-6 space-y-3">
              {d.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  {/* Numbered because these ARE ordered — the scorer emits them
                      worst-first, so doing them in order is doing the most
                      damaging one first. */}
                  <Fact className="shrink-0 text-muted-foreground">{String(i + 1).padStart(2, "0")}</Fact>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">Nothing to do — keep it up.</p>
          )}
        </Section>

        <Section
          title="List & domain health"
          aside={
            d.domains.unverified > 0 ? (
              <Link
                href="/settings/sender"
                className="inline-flex items-center gap-1.5 text-sm text-acted hover:underline"
              >
                <Info className="size-3.5 shrink-0" />
                {d.domains.unverified} domain{d.domains.unverified === 1 ? "" : "s"} need DKIM verification
              </Link>
            ) : null
          }
        >
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <dl className="divide-y divide-rule border-t border-rule text-sm">
              {[
                { label: "Suppressed addresses", value: d.suppressions.total, strong: true },
                { label: "— from bounces", value: d.suppressions.by_reason.bounce ?? 0 },
                { label: "— from complaints", value: d.suppressions.by_reason.complaint ?? 0 },
                {
                  label: "Verified sending domains",
                  value: `${d.domains.verified} / ${d.domains.total}`,
                  strong: true,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className={cn("tabular-nums", row.strong && "font-medium")} data-fact>
                    {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <SuppressionsImport defaultOpen={importOpen} />
          </div>
        </Section>

        <Section title="What moves inbox placement">
          <ul className="-mt-5">
            {levers.map((p) => (
              <Lever key={p.title} p={p} />
            ))}
          </ul>
        </Section>
      </Reveal>
    </>
  );
}
