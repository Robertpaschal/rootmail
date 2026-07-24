import Link from "next/link";
import { CheckCircle2, Eye, Megaphone, MousePointerClick, Send, TriangleAlert, Zap } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Analytics } from "@/lib/types";
import { cn } from "@/lib/utils";

type Scope = "transactional" | "marketing" | "all";

const SCOPE_META: Record<Scope, { title: string; desc: string }> = {
  transactional: {
    title: "Transactional analytics",
    desc: "Engagement across the receipts, resets and alerts your app sends one person at a time.",
  },
  marketing: {
    title: "Marketing analytics",
    desc: "Engagement across the campaigns, newsletters and promos you send to an audience.",
  },
  all: { title: "Analytics", desc: "Engagement across everything you send — both wings together." },
};

const SCOPE_TABS: { id: Scope; label: string; icon: typeof Zap }[] = [
  { id: "all", label: "Everything", icon: Send },
  { id: "transactional", label: "Transactional", icon: Zap },
  { id: "marketing", label: "Marketing", icon: Megaphone },
];

function ScopeToggle({ active }: { active: Scope }) {
  return (
    <div className="inline-flex rounded-lg bg-secondary/60 p-1">
      {SCOPE_TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={`/analytics?scope=${t.id}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  // ONE analytics section for the whole product: default to everything, and let
  // the in-page toggle (or a ?scope= deep link) narrow to a wing. The wing split
  // lives INSIDE the page — never duplicated as separate nav sections.
  const scope: Scope =
    sp.scope === "transactional" || sp.scope === "marketing" || sp.scope === "all" ? sp.scope : "all";
  const meta = SCOPE_META[scope];
  const type = scope === "all" ? undefined : scope;

  let a: Analytics;
  try {
    a = await api.getAnalytics({ window_days: 30, type });
  } catch (err) {
    return (
      <>
        <PageHeader title={meta.title} description={meta.desc} />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const bounceTone =
    a.rates.bounce > 5
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : a.rates.bounce > 2
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : undefined;
  const funnel = [
    { label: "Sent", value: a.funnel.sent, hint: "left for the provider", icon: Send },
    { label: "Delivered", value: a.funnel.delivered, hint: `${a.rates.delivery}% of sent`, icon: CheckCircle2 },
    { label: "Opened", value: a.funnel.opened, hint: `${a.rates.open}% open rate`, icon: Eye },
    { label: "Clicked", value: a.funnel.clicked, hint: `${a.rates.click}% click rate`, icon: MousePointerClick },
    { label: "Bounced / spam", value: `${a.rates.bounce}%`, hint: "of sent — keep under 2%", icon: TriangleAlert, tone: bounceTone },
  ] as { label: string; value: number | string; hint: string; icon: typeof Send; tone?: string }[];
  const maxDay = Math.max(1, ...a.series.map((d) => d.sent));
  const noData = a.funnel.sent === 0;

  return (
    <>
      <PageHeader title={meta.title} description={meta.desc} actions={<ScopeToggle active={scope} />} />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {funnel.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-lg", f.tone ?? "bg-primary/10 text-primary")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold tabular-nums">
                      {typeof f.value === "number" ? f.value.toLocaleString() : f.value}
                    </div>
                    <div className="text-sm font-medium">{f.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{f.hint}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {noData ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No {scope === "all" ? "" : `${scope} `}sends in the last {a.window_days} days yet — engagement shows up
              here once mail starts flowing.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sends per day</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-36 items-end gap-0.5">
                  {a.series.map((d) => (
                    <div
                      key={d.date}
                      className="flex-1 rounded-t bg-primary/80 transition-colors hover:bg-primary"
                      style={{ height: `${Math.max(2, (d.sent / maxDay) * 100)}%` }}
                      title={`${d.date}: ${d.sent} sent`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{a.series[0]?.date}</span>
                  <span>{a.series[a.series.length - 1]?.date}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top templates</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {a.top_templates.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No template-based sends in this window yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Delivery rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.top_templates.map((t) => (
                        <TableRow key={t.template_id ?? t.name}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.sent.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.delivered.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.delivered_rate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
