import { Fragment, Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  FileText,
  Megaphone,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { Fact, Metric } from "@rootmail/design";
import { ChangeFeed } from "@/components/app/change-feed";
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
import { loadChanges, quietSentence } from "@/lib/changes";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";

// Tolerate a missing number: the dashboard and API deploy separately, so a
// newer page must never white-screen against a field an older API hasn't
// started sending yet.
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();

/** A funnel figure. The two-arm union is what makes it impossible to render an
 *  inference without the caveat naming its bias — `Metric` requires one. */
type FunnelStat =
  | { value: string; label: string; window: string; method: string; threshold?: string; inferred?: false; caveat?: undefined }
  | { value: string; label: string; window: string; method: string; threshold?: string; inferred: true; caveat: string };
const pct = (n: number) => `${Math.round(n)}%`;

/**
 * Five hardcoded palettes (emerald / lime / amber / orange / red), none of them
 * with a dark counterpart that worked, became three: this system has exactly
 * three signal colours and they mean *witnessed*, *we intervened* and
 * *stopped*. A grade is not a fourth thing; it is a compression of the same
 * numbers, so it borrows their colours or it gets ink.
 */
function gradeTone(grade: string | null): string {
  switch (grade) {
    case "A":
    case "B":
      return "bg-witnessed-tint text-witnessed";
    case "C":
    case "D":
      return "bg-acted-tint text-acted";
    case "F":
      return "bg-stopped-tint text-stopped";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

// The Overview sits ABOVE the wing switcher, so it's the ONE product-wide view:
// shared sending health up top (deliverability + the whole funnel), then each
// wing on its own terms with its own action — never one wing's compose button
// leaking onto the other — then shortcuts, recent activity, and the workspace
// (the product the user is in) with its billing.
// Furniture, not home. Signed-in landing is Mail at /messages.
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
  // What the system NOTICED and what it DID. Fetched with everything else and
  // rendered FIRST: §8 of the design philosophy says the day-30 default view is
  // not a grid of metrics, it is what changed and what we did about it. The
  // numbers keep their place, one section down.
  const { changes } = await loadChanges(5);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);

  const me = ok(meR);
  if (!me) {
    return <ConnectionErrorCard message="We couldn't load your overview just now." />;
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
  // Four figures at four identical weights was the industry's founding lie
  // shipped on our own overview: "delivered" is a provider confirmation and
  // "opened" is a tracking pixel firing, and roughly a third of those are a
  // mail client prefetching an image. `Metric` takes a required window and
  // method, and an `inferred` number REQUIRES a caveat naming the bias — so
  // this array cannot be written dishonestly without editing the design
  // package. See docs/design/00-PHILOSOPHY.md §5.3.
  const funnel: FunnelStat[] | null = analytics
    ? [
        { value: fmt(analytics.funnel.sent), label: "sent", window: "30d", method: "api+worker" },
        {
          value: fmt(analytics.funnel.delivered),
          label: "delivered",
          window: "30d",
          method: "provider confirmation",
          threshold: `${pct(analytics.rates.delivery)} of sent`,
        },
        {
          value: fmt(analytics.funnel.opened),
          label: "opened",
          window: "30d",
          method: "tracking pixel",
          inferred: true,
          caveat: "undercounts blocked images, overcounts prefetch",
          threshold: `${pct(analytics.rates.open)} of delivered`,
        },
        {
          value: fmt(analytics.funnel.clicked),
          label: "clicked",
          window: "30d",
          method: "link redirect",
          inferred: true,
          caveat: "a scanner following a link counts as a person",
          threshold: `${pct(analytics.rates.click)} of delivered`,
        },
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
          {/* "This period" is not a window, and the card below it said 30
              days while the billing meters below THAT were a calendar month —
              three periods and one undefined word. A number without a window is
              not a number. */}
          <p className="text-sm text-muted-foreground">
            <Fact>{fmt(analytics?.funnel.sent ?? messages.length)}</Fact> messages left{" "}
            {workspace?.name ?? "your workspace"} in the last <Fact>30 days</Fact>.{" "}
            {problems > 0 ? (
              <>
                <Fact className="text-stopped">{fmt(problems)}</Fact> of them need you.
              </>
            ) : (
              <>None of them stopped.</>
            )}
          </p>
        </div>
        <Link href="/assistant" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Sparkles className="size-4" /> Ask the assistant
        </Link>
      </div>

      <Suspense fallback={null}>
        <OnboardingChecklist />
      </Suspense>

      {/* THE PRODUCT SPEAKING FIRST. Everything below this is a read-out; this
          is the only section that tells the operator something they did not
          already know to ask for. It leads for that reason. */}
      <section>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium tracking-heading">What changed</h2>
          <Link href="/activity" className="inline-flex items-center gap-1 text-sm hover:underline">
            Everything we did <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <ChangeFeed changes={changes} quiet={quietSentence(messages.length > 0)} />
      </section>

      {/* Shared sending health — reputation + the whole funnel belong to the
          workspace, not a wing, so they lead. */}
      {/* SENDING HEALTH, AS ONE STATEMENT — not two boxes of numbers.
          The score and the funnel are the same measurement read at two zoom
          levels, so they sit on one band under one rule: the grade, then the
          journey those sends took, then the share that ended badly. Two Cards
          made them look like two unrelated readings you have to reconcile. */}
      <Reveal delay={0.03}>
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/20 pb-2">
            <h2 className="text-sm font-medium uppercase tracking-wide">Everything you send · 30 days</h2>
            <span className="flex items-center gap-4">
              <Link
                href="/messages?status=bounced"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-interaction ease-interaction",
                  bounceRate > 5
                    ? "border-stopped/40 bg-stopped-tint text-stopped"
                    : bounceRate > 2
                      ? "border-acted/40 bg-acted-tint text-acted"
                      : "text-muted-foreground hover:text-foreground",
                )}
                title="Bounces + spam complaints as a share of everything sent"
              >
                <TriangleAlert className="size-3.5" /> {pct(bounceRate)} bounced / spam
              </Link>
              <Link href="/deliverability" className="text-sm text-primary hover:underline">
                Deliverability <ArrowRight className="inline size-3.5" />
              </Link>
              <Link href="/analytics?scope=all" className="text-sm text-primary hover:underline">
                Analytics <ArrowRight className="inline size-3.5" />
              </Link>
            </span>
          </div>

          <div className="space-y-6 pt-5">
            {/* The grade, as the first fact on the band rather than its own card. */}
            <Link href="/deliverability" className="flex items-center gap-3">
              {deliver && deliver.score != null ? (
                <>
                  <span
                    className={cn(
                      "display-num grid size-14 shrink-0 place-items-center rounded-full text-xl",
                      gradeTone(deliver.grade),
                    )}
                  >
                    {deliver.grade ?? "—"}
                  </span>
                  <Metric
                    value={`${deliver.score}/100`}
                    label={deliver.status.replace("_", " ")}
                    window={`${deliver.window_days}d`}
                    method="bounce + complaint + suppression mix"
                    threshold={deliver.confidence === "high" ? undefined : `confidence: ${deliver.confidence}`}
                  />
                </>
              ) : (
                // "A few" is the wrong number and there is a right one: the
                // scorer damps below 20 judged sends and refuses to score with
                // none (packages/core/src/deliverability.ts).
                <span className="max-w-sm text-sm text-muted-foreground">
                  Not enough sending to score yet — we need about <Fact>20</Fact> judged messages in
                  the window before a score means anything.
                </span>
              )}
            </Link>

            {funnel ? (
              /* A fixed four-up, not a wrapping row: the funnel is an ORDER,
                 and a row that wraps three-then-one puts "clicked" underneath
                 "sent" as if it followed it. The chain is drawn as a rule
                 between the columns rather than as arrows that wrap on their
                 own. */
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-rule pt-5 lg:grid-cols-4">
                {funnel.map((s, i) => (
                  <Fragment key={s.label}>
                    <Link
                      href="/analytics?scope=all"
                      className={cn("min-w-0", i > 0 && "border-l border-rule pl-6")}
                    >
                      {s.inferred ? (
                        <Metric
                          value={s.value}
                          label={s.label}
                          window={s.window}
                          method={s.method}
                          threshold={s.threshold}
                          inferred
                          caveat={s.caveat}
                        />
                      ) : (
                        <Metric
                          value={s.value}
                          label={s.label}
                          window={s.window}
                          method={s.method}
                          threshold={s.threshold}
                        />
                      )}
                    </Link>
                  </Fragment>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Send a few emails and your journey — sent, delivered, opened, clicked — shows up here.
              </p>
            )}
          </div>

          {deliver?.recommendations?.length ? (
            <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{deliver.recommendations[0]}</p>
          ) : null}
        </section>
      </Reveal>

      {/* The two wings, each self-contained: its own metric, its own compose action,
          its own handoff. Neither borrows the other's buttons. */}
      <Reveal delay={0.08} className="grid gap-4 lg:grid-cols-2">
        {/* No accent colour. The wings used to be violet and amber, and amber
            now means "we intervened" — spending the alarm colour on a noun
            means the day it fires nobody looks up. State outranks navigation
            (docs/design/00-PHILOSOPHY.md §9.7); the wings are told apart by
            their name, their icon and their metric. */}
        <WingCard
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
            { label: "delivery rate · 30d · provider confirmation", value: txStats ? pct(txDelivery) : "—" },
            { label: "sent · 30d · api+worker", value: fmt(txSent30) },
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
            // An open rate is a tracking pixel firing. It says so, at the same
            // size as the number, forever.
            { label: "open rate · 30d · tracking pixel · inferred", value: mkStats ? pct(mkOpen) : "—", inferred: true },
            {
              label: "contacts · now · your audience",
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

      {/* Cross-wing shortcuts. Four equal bordered tiles with a tinted icon
          chip each is what a dashboard grows when nobody decided what the page
          is for — and it was the fourth grid of boxes on one screen. Same four
          destinations, one ruled row, no chips. */}
      <Reveal delay={0.12} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4">
        {quickActions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <a.icon className="size-4" /> {a.label}
          </Link>
        ))}
      </Reveal>

      {/* Recent activity + the workspace (the product you're in) with its billing. */}
      <Reveal delay={0.16} className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between gap-2 border-b border-ink/20 pb-2">
            <h2 className="text-sm font-medium uppercase tracking-wide">Latest out the door</h2>
            <Link href="/messages" className="text-sm text-primary hover:underline">
              The whole register <ArrowRight className="inline size-3.5" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="pt-5 text-sm text-muted-foreground">
              The first message you send appears here within seconds, with the line showing how far
              it got.
            </p>
          ) : (
            /* The same object as /messages, at ten rows: the line leads, the
               recipient identifies, the subject is secondary. A four-column
               table here and a register there would be two vocabularies for
               one thing. */
            <ul className="mt-1">
              {recent.map((m) => (
                <li key={m.id} className="border-b border-rule">
                  <Link
                    href={`/messages/${m.id}`}
                    className="-mx-2 flex items-center gap-4 rounded-md px-2 py-2.5 transition-colors duration-interaction ease-interaction hover:bg-secondary/40"
                  >
                    <MessageFlow message={m} />
                    <span className="w-full min-w-0 truncate text-sm font-medium sm:w-56">{m.to}</span>
                    <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                      {m.subject || "(no subject)"}
                    </span>
                    <span
                      className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                      data-fact
                    >
                      {relativeTime(m.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                tone={problems > 0 ? "text-stopped" : undefined}
              />
            </div>
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

type WingStat = { label: string; value: string; inferred?: boolean };

function WingCard({
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
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border text-foreground">
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
                  headline.over ? "bg-stopped" : headline.pct > 80 ? "bg-acted" : "bg-ink",
                )}
                style={{ width: `${headline.pct}%` }}
              />
            </div>
            {secondary ? (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{secondary.label}</span>
                  <span className={cn(secondary.over && "font-medium text-stopped")}>
                    {secondary.text}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      secondary.over ? "bg-stopped" : secondary.pct > 80 ? "bg-acted" : "bg-ink/60",
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
            <div key={s.label} className="rounded-md border bg-secondary/30 p-3">
              <div
                className={cn("text-xl font-semibold tabular-nums", s.inferred && "text-ink-muted")}
                data-fact
              >
                {s.value}
              </div>
              <div className="font-mono text-[11px] leading-snug text-muted-foreground">
                {s.label}
              </div>
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
