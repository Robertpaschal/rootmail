import { Fragment, Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Mail,
  MousePointerClick,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { Greeting } from "@/components/app/greeting";
import { Reveal } from "@/components/app/motion";
import { MessageFlow } from "@/components/app/message-flow";
import { OnboardingChecklist } from "@/components/app/onboarding-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/rootmail";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString();
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

export default async function OverviewPage() {
  // The overview adapts to the wing the user is working in (nav switcher cookie).
  const wingCookie = (await cookies()).get("rm_wing")?.value;
  const activeWing = wingCookie === "marketing" ? "marketing" : "transactional";
  // Pull the whole snapshot in parallel; tolerate partial failure so one slow/erroring
  // endpoint doesn't blank the home page.
  const [meR, billR, anaR, delR, msgR, listR, tplR] = await Promise.allSettled([
    api.me(),
    api.getBilling(),
    api.getAnalytics({ window_days: 30 }),
    api.getDeliverability({ window_days: 30 }),
    api.listMessages({ limit: 100 }),
    api.listLists(),
    api.listTemplates(),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);

  const me = ok(meR);
  if (!me) {
    return <ConnectionErrorCard message="Couldn't reach the rootmail API." showReconnect />;
  }

  const billing = ok(billR);
  const analytics = ok(anaR);
  const deliver = ok(delR);
  const messages = ok(msgR)?.data ?? [];
  const lists = ok(listR)?.data ?? [];
  const templates = ok(tplR)?.data ?? [];

  const firstName = me.user.name?.trim().split(" ")[0] || me.user.email.split("@")[0];
  const workspace = me.active_workspace ?? me.workspaces[0] ?? null;
  const usage = billing?.usage;
  const usedPct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;
  const recent = messages.slice(0, 6);
  const problems = messages.filter((m) => ["bounced", "complained", "failed"].includes(m.status)).length;

  // The 30-day journey of your email, as a connected flow — each stage carries
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

  const quickActions = [
    { href: "/messages/new", label: "Compose", icon: Send },
    { href: "/contacts?add=import", label: "Import contacts", icon: Upload },
    { href: "/templates/new", label: "Design a template", icon: FileText },
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
            Here&apos;s how {workspace?.name ?? "your workspace"} is doing
            {billing ? (
              <>
                {" "}
                on the <span className="font-medium text-foreground">{billing.plan.name}</span> plan
              </>
            ) : null}
            .
          </p>
        </div>
        <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Send className="size-4" /> Compose
        </Link>
      </div>

      <Suspense fallback={null}>
        <OnboardingChecklist />
      </Suspense>

      <Reveal delay={0.03} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">This month&apos;s sending</CardTitle>
            <Link href="/billing" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Plan &amp; usage <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {usage ? (
              activeWing === "transactional" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold tracking-tight">{fmt(usage.used)}</span>
                    <span className="text-sm text-muted-foreground">
                      of {fmt(usage.quota)} transactional sends
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        usage.over_limit ? "bg-red-500" : usedPct > 80 ? "bg-amber-500" : "bg-primary",
                      )}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {usage.over_limit
                      ? `Past your send volume — ${fmt(usage.overage)} extra this period.`
                      : `${fmt(usage.remaining)} sends left this period.`}{" "}
                    Marketing has its own meter in its wing.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold tracking-tight">{fmt(usage.contacts_used)}</span>
                    <span className="text-sm text-muted-foreground">
                      {usage.contacts_limit === -1
                        ? "contacts in your audiences"
                        : `of ${fmt(usage.contacts_limit)} contacts`}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        usage.contacts_limit !== -1 && usage.contacts_used >= usage.contacts_limit
                          ? "bg-red-500"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${
                          usage.contacts_limit > 0
                            ? Math.min(100, Math.round((usage.contacts_used / usage.contacts_limit) * 100))
                            : 4
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {fmt(usage.marketing_sent)} marketing emails sent this period — campaigns never
                    consume send blocks. Transactional has its own meter in its wing.
                  </p>
                </>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Usage appears here once you start sending.</p>
            )}
          </CardContent>
        </Card>

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
                  <p className="text-xs capitalize text-muted-foreground">
                    {deliver.status.replace("_", " ")}
                  </p>
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
      </Reveal>

      <Reveal delay={0.08}>
        <Card>
          <CardContent className="p-5">
            {funnel ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
                {funnel.map((s, i) => (
                  <Fragment key={s.label}>
                    {i > 0 ? <ArrowRight className="size-4 shrink-0 text-muted-foreground/40" /> : null}
                    <Link href="/analytics" className="group min-w-[118px] flex-1">
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

      <Reveal delay={0.13}>
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

      <Reveal delay={0.18} className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent messages</CardTitle>
            <Link href="/messages" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No messages yet — compose your first one.
              </p>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <SnapshotRow icon={Users} label="Audiences" value={lists.length} href="/contacts?tab=audiences" />
            <SnapshotRow icon={FileText} label="Templates" value={templates.length} href="/templates" />
            <SnapshotRow
              icon={TriangleAlert}
              label="Problems (last 100)"
              value={problems}
              href="/messages"
              tone={problems > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
          </CardContent>
        </Card>
      </Reveal>
    </div>
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
