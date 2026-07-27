import { Fragment, Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CreditCard,
  FileText,
  Mail,
  Megaphone,
  MousePointerClick,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Greeting } from "@/components/app/greeting";
import { Reveal } from "@/components/app/motion";
import { MessageFlow } from "@/components/app/message-flow";
import { OnboardingChecklist } from "@/components/app/onboarding-checklist";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";

// Tolerate a missing number: the dashboard and API deploy separately, so a
// newer page must never white-screen against a field an older API hasn't
// started sending yet.
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const pct = (n: number) => `${Math.round(n)}%`;

function gradeTone(grade: string | null): string {
  switch (grade) {
    case "A":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "B":
      return "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-400";
    case "C":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
    case "D":
      return "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400";
    case "F":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

// The Overview sits ABOVE the wing switcher, so it's the ONE product-wide view:
// shared sending health up top (deliverability + the whole funnel), then each
// wing on its own terms with its own action — never one wing's compose button
// leaking onto the other — then shortcuts, recent activity, and the workspace
// (the product the user is in) with its billing.
export default async function OverviewPage() {
  const [meR, billR, anaR, txR, mkR, delR, msgR, listR, tplR, cmpR] = await Promise.allSettled([
    api.me(),
    api.getBilling(),
    api.getAnalytics({ window_days: 30 }),
    api.getAnalytics({ window_days: 30, type: "transactional" }),
    api.getAnalytics({ window_days: 30, type: "marketing" }),
    api.getDeliverability({ window_days: 30 }),
    api.listMessages({ limit: 100 }),
    api.listLists(),
    api.listTemplates(),
    api.listCampaigns(),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);

  const me = ok(meR);
  if (!me) {
    return <ConnectionErrorCard message="Couldn't reach the rootmail API." showReconnect />;
  }

  const billing = ok(billR);
  const analytics = ok(anaR);
  const txStats = ok(txR);
  const mkStats = ok(mkR);
  const deliver = ok(delR);
  const messages = ok(msgR)?.data ?? [];
  const lists = ok(listR)?.data ?? [];
  const templates = ok(tplR)?.data ?? [];
  const campaigns = ok(cmpR)?.data ?? [];

  const firstName = me.user.name?.trim().split(" ")[0] || me.user.email.split("@")[0];
  const workspace = me.active_workspace ?? me.workspaces[0] ?? null;
  const usage = billing?.usage;
  const problems = messages.filter((m) => ["bounced", "complained", "failed"].includes(m.status)).length;
  // Latest 10 — a glance at what's moving, never a page-swallowing table.
  const recent = messages.slice(0, 10);

  // The 30-day journey of ALL your email, as a connected flow — each stage carries
  // its count AND the rate from the stage before, ending in a sender-health chip.
  const funnel = analytics
    ? [
        { label: "Sent", value: fmt(analytics.funnel.sent), hint: "last 30 days", icon: Send },
        { label: "Delivered", value: fmt(analytics.funnel.delivered), hint: `${pct(analytics.rates.delivery)} of sent`, icon: CheckCircle2 },
        { label: "Opened", value: fmt(analytics.funnel.opened), hint: `${pct(analytics.rates.open)} open rate`, icon: Mail },
        { label: "Clicked", value: fmt(analytics.funnel.clicked), hint: `${pct(analytics.rates.click)} click rate`, icon: MousePointerClick },
      ]
    : null;
  const bounceRate = analytics?.rates.bounce ?? 0;

  // Each wing, on its own terms: transactional is metered by send volume, marketing
  // by audience size — so their headline numbers are deliberately different.
  const txSent30 = txStats?.funnel.sent ?? 0;
  const txDelivery = txStats?.rates.delivery ?? 0;
  // Keep the transactional panel's "recent" line to its OWN wing (marketing/sales
  // sends live in the marketing panel), so neither wing borrows the other's data.
  const lastMessage = messages.find((m) => m.type === "transactional") ?? null;

  const mkSent30 = mkStats?.funnel.sent ?? 0;
  const mkOpen = mkStats?.rates.open ?? 0;
  const lastCampaign = campaigns[0] ?? null;

  const usedPct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;
  // Older API → no daily fields; show the monthly meter alone rather than break.
  const txDaily = usage?.daily_limit ?? -1;
  const txDailyPct =
    usage && txDaily > 0 ? Math.min(100, Math.round(((usage.used_today ?? 0) / txDaily) * 100)) : 0;
  // The marketing meter is SEND VOLUME (monthly allowance + daily cap) — its own
  // counter, fully distinct from the transactional block meter. Contacts are the
  // pricing base, shown as a stat, not the headline.
  const mkMonthlyPct =
    usage && usage.marketing_allowance > 0
      ? Math.min(100, Math.round((usage.marketing_sent / usage.marketing_allowance) * 100))
      : 0;
  const mkDailyPct =
    usage && usage.marketing_daily_limit > 0
      ? Math.min(100, Math.round((usage.marketing_sent_today / usage.marketing_daily_limit) * 100))
      : 0;
  const money = (n: number) => `$${n.toFixed(2)}`;

  const quickActions = [
    { href: "/contacts?add=import", label: "Import contacts", icon: Upload },
    { href: "/templates/new", label: "Design a template", icon: FileText },
    { href: "/analytics?scope=all", label: "View analytics", icon: BarChart3 },
    { href: "/assistant", label: "Ask the assistant", icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Greeting name={firstName} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s how {workspace?.name ?? "your workspace"} is doing this period.
          </p>
        </div>
        <Link href="/assistant" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Sparkles className="size-4" /> Ask the assistant
        </Link>
      </div>

      <Suspense fallback={null}>
        <OnboardingChecklist />
      </Suspense>

      {/* Shared sending health — reputation + the whole funnel belong to the
          workspace, not a wing, so they lead. */}
      <Reveal delay={0.03} className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Deliverability</CardTitle>
            <Link
              href="/deliverability"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Details <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {deliver && deliver.score != null ? (
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "grid size-14 shrink-0 place-items-center rounded-full text-xl font-bold",
                    gradeTone(deliver.grade),
                  )}
                >
                  {deliver.grade ?? "—"}
                </span>
                <div>
                  <p className="text-2xl font-bold tracking-tight">
                    {deliver.score}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{deliver.status.replace("_", " ")}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Send a few emails to earn a reputation score.</p>
            )}
            {deliver?.recommendations?.length ? (
              <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{deliver.recommendations[0]}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Everything you send · 30 days</CardTitle>
            <Link
              href="/analytics?scope=all"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Analytics <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {funnel ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
                {funnel.map((s, i) => (
                  <Fragment key={s.label}>
                    {i > 0 ? <ArrowRight className="size-4 shrink-0 text-muted-foreground/40" /> : null}
                    <Link href="/analytics?scope=all" className="group min-w-[104px] flex-1">
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <s.icon className="size-4" /> {s.label}
                      </span>
                      <span className="mt-1 block text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                        {s.value}
                      </span>
                      <span className="block text-xs text-muted-foreground">{s.hint}</span>
                    </Link>
                  </Fragment>
                ))}
                <Link
                  href="/messages?status=bounced"
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    bounceRate > 5
                      ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                      : bounceRate > 2
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Bounces + spam complaints as a share of everything sent"
                >
                  <TriangleAlert className="size-3.5" /> {pct(bounceRate)} bounced / spam
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Send a few emails and your journey — sent, delivered, opened, clicked — shows up here.
              </p>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* The two wings, each self-contained: its own metric, its own compose action,
          its own handoff. Neither borrows the other's buttons. */}
      <Reveal delay={0.08} className="grid gap-4 lg:grid-cols-2">
        <WingCard
          accent="text-violet-600 dark:text-violet-400"
          accentBg="bg-violet-500/10"
          icon={Zap}
          name="Transactional"
          blurb="Receipts, resets and alerts your app sends one person at a time."
          headline={
            usage
              ? {
                  value: fmt(usage.used),
                  of: `of ${fmt(usage.quota)} transactional sends`,
                  pct: usedPct,
                  over: usage.over_limit,
                }
              : null
          }
          secondary={
            usage && txDaily > 0
              ? {
                  label: "Today",
                  text: `${fmt(usage.used_today)} of ${fmt(txDaily)} daily cap`,
                  pct: txDailyPct,
                  over: (usage.used_today ?? 0) >= txDaily,
                }
              : null
          }
          headlineEmpty="Usage appears here once you start sending."
          stats={[
            { label: "Delivery rate", value: txStats ? pct(txDelivery) : "—" },
            { label: "Sent · 30d", value: fmt(txSent30) },
          ]}
          recent={
            lastMessage ? (
              <Link
                href={`/messages/${lastMessage.id}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <MessageFlow message={lastMessage} />
                <span className="truncate">{lastMessage.subject || lastMessage.to}</span>
                <span className="ml-auto shrink-0 text-xs">{relativeTime(lastMessage.created_at)}</span>
              </Link>
            ) : null
          }
          primary={{ href: "/messages/new", label: "Send email", icon: Send }}
          analyticsHref="/analytics?scope=transactional"
          openHref="/messages"
        />

        <WingCard
          accent="text-amber-600 dark:text-amber-400"
          accentBg="bg-amber-500/10"
          icon={Megaphone}
          name="Marketing"
          blurb="Campaigns, newsletters and promos you send to an audience."
          headline={
            usage
              ? {
                  value: fmt(usage.marketing_sent),
                  of: `of ${fmt(usage.marketing_allowance)} marketing sends`,
                  pct: mkMonthlyPct,
                  over: usage.marketing_allowance > 0 && usage.marketing_sent >= usage.marketing_allowance,
                }
              : null
          }
          secondary={
            usage
              ? {
                  label: "Today",
                  text: `${fmt(usage.marketing_sent_today)} of ${fmt(usage.marketing_daily_limit)} daily cap`,
                  pct: mkDailyPct,
                  over: usage.marketing_daily_limit > 0 && usage.marketing_sent_today >= usage.marketing_daily_limit,
                }
              : null
          }
          headlineEmpty="Grow an audience to start marketing."
          stats={[
            { label: "Open rate", value: mkStats ? pct(mkOpen) : "—" },
            {
              label: "Contacts",
              value: usage
                ? `${fmt(usage.contacts_used)}${usage.contacts_limit === -1 ? "" : ` / ${fmt(usage.contacts_limit)}`}`
                : fmt(0),
            },
          ]}
          recent={
            lastCampaign ? (
              <Link
                href={`/campaigns/${lastCampaign.id}`}
                className="flex items-center gap-2 hover:text-foreground"
              >
                <Megaphone className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{lastCampaign.name}</span>
                <span className="ml-auto shrink-0 text-xs capitalize">{lastCampaign.status}</span>
              </Link>
            ) : null
          }
          primary={{ href: "/campaigns/new", label: "New campaign", icon: Megaphone }}
          analyticsHref="/analytics?scope=marketing"
          openHref="/campaigns"
        />
      </Reveal>

      {/* Quick actions — cross-wing shortcuts (the wings own the compose actions). */}
      <Reveal delay={0.12}>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Quick actions</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <a.icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{a.label}</span>
            </Link>
          ))}
        </div>
      </Reveal>

      {/* Recent activity + the workspace (the product you're in) with its billing. */}
      <Reveal delay={0.16} className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent messages</CardTitle>
            <Link href="/messages" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No messages yet — send your first one.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <MessageFlow message={m} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/messages/${m.id}`} className="hover:underline">
                          {m.to}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{m.subject}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {relativeTime(m.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* The workspace IS the product the user has — so it's titled by its name,
            and carries both the at-a-glance contents and the billing. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              <span className="truncate">{workspace?.name ?? "Workspace"}</span>
              {workspace?.environment ? (
                <Badge variant={workspace.environment === "test" ? "secondary" : "success"} className="shrink-0">
                  {workspace.environment === "test" ? "Sandbox" : "Live"}
                </Badge>
              ) : null}
            </CardTitle>
            <Link href="/settings" className="text-sm text-primary hover:underline">
              Manage
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* What you're billed — the headline number, not the pricing scheme.
                The full breakdown (and the transactional-vs-marketing definitions)
                lives on Plan & usage. */}
            <Link
              href="/billing"
              className="-mx-2 flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-secondary/60"
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="size-4" /> Your bill this month
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                {billing ? (billing.summary.custom ? "Custom" : `${money(billing.summary.total)}/mo`) : "—"}
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </span>
            </Link>
            {billing && !billing.summary.custom ? (
              <p className="px-0.5 text-xs text-muted-foreground">
                {billing.summary.lines.length + billing.summary.add_ons.length > 0
                  ? `${billing.summary.lines.length + billing.summary.add_ons.length} item${
                      billing.summary.lines.length + billing.summary.add_ons.length === 1 ? "" : "s"
                    } — full breakdown in Plan & usage.`
                  : "You're on the free allowances — nothing billed."}
              </p>
            ) : null}

            <div className="space-y-1 border-t pt-2">
              <SnapshotRow icon={Users} label="Audiences" value={lists.length} href="/contacts?tab=audiences" />
              <SnapshotRow icon={FileText} label="Templates" value={templates.length} href="/templates" />
              <SnapshotRow
                icon={TriangleAlert}
                label="Delivery problems"
                value={problems}
                href="/messages?status=bounced"
                tone={problems > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
              />
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

type WingStat = { label: string; value: string };

function WingCard({
  accent,
  accentBg,
  icon: Icon,
  name,
  blurb,
  headline,
  secondary,
  headlineEmpty,
  stats,
  recent,
  primary,
  analyticsHref,
  openHref,
}: {
  accent: string;
  accentBg: string;
  icon: typeof Zap;
  name: string;
  blurb: string;
  headline: { value: string; of: string; pct: number; over: boolean } | null;
  /** A slim second meter under the headline (e.g. the marketing DAILY cap). */
  secondary?: { label: string; text: string; pct: number; over: boolean } | null;
  headlineEmpty: string;
  stats: WingStat[];
  recent: React.ReactNode;
  primary: { href: string; label: string; icon: typeof Send };
  analyticsHref: string;
  openHref: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg", accentBg, accent)}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <Link href={openHref} className="font-semibold hover:underline">
              {name}
            </Link>
            <p className="text-xs leading-snug text-muted-foreground">{blurb}</p>
          </div>
        </div>

        {headline ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold tracking-tight">{headline.value}</span>
              <span className="text-sm text-muted-foreground">{headline.of}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full",
                  headline.over ? "bg-red-500" : headline.pct > 80 ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${headline.pct}%` }}
              />
            </div>
            {secondary ? (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{secondary.label}</span>
                  <span className={cn(secondary.over && "font-medium text-red-600 dark:text-red-400")}>
                    {secondary.text}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      secondary.over ? "bg-red-500" : secondary.pct > 80 ? "bg-amber-500" : "bg-primary/60",
                    )}
                    style={{ width: `${secondary.pct}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{headlineEmpty}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-secondary/30 p-3">
              <div className="text-xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {recent ? (
          <div className="truncate border-t pt-3 text-sm text-muted-foreground">{recent}</div>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Link href={primary.href} className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
            <primary.icon className="size-4" /> {primary.label}
          </Link>
          <Link
            href={analyticsHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-muted-foreground")}
          >
            Analytics <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SnapshotRow({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  href: string;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-secondary/60"
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" /> {label}
      </span>
      <span className={cn("text-sm font-semibold", tone)}>{fmt(value)}</span>
    </Link>
  );
}
