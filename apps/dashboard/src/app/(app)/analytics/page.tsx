import Link from "next/link";
import { Megaphone, Send, Zap } from "lucide-react";
import { Metric } from "@rootmail/design";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TrendChart } from "@/components/app/trend-chart";
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
          status={err instanceof ApiError ? err.status : undefined}
        />
      </>
    );
  }

  // THE SOURCING LINE, applied. Every figure below carries the window it covers
  // and the method that produced it, and the two that are INFERRED say so and
  // render hollow: an open is a tracking pixel firing and a click is a redirect
  // being followed, and roughly a third of each is a machine. Drawing them in
  // the same weight as a provider confirmation is the lie this product exists
  // to refuse (docs/design/00-PHILOSOPHY.md §1, §5.3).
  const w = `${a.window_days}d`;
  const funnel: React.ComponentProps<typeof Metric>[] = [
    { value: a.funnel.sent.toLocaleString(), label: "sent", window: w, method: "api+worker" },
    {
      value: a.funnel.delivered.toLocaleString(),
      label: "delivered",
      window: w,
      method: "provider feedback",
      threshold: `${a.rates.delivery}% of sent`,
    },
    {
      value: a.funnel.opened.toLocaleString(),
      label: "opened",
      window: w,
      method: "tracking pixel",
      threshold: `${a.rates.open}% of delivered`,
      inferred: true,
      caveat: "undercounts blocked images",
    },
    {
      value: a.funnel.clicked.toLocaleString(),
      label: "clicked",
      window: w,
      method: "link redirect",
      threshold: `${a.rates.click}% of delivered`,
      inferred: true,
      caveat: "counts scanner prefetches",
    },
    {
      value: `${a.rates.bounce}%`,
      label: "bounced or marked spam",
      window: w,
      method: "provider feedback",
      threshold: "keep under 2%",
    },
  ];
  const noData = a.funnel.sent === 0;

  return (
    <>
      <PageHeader title={meta.title} description={meta.desc} actions={<ScopeToggle active={scope} />} />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-rule py-6 lg:grid-cols-5">
          {funnel.map((f) => (
            <Metric key={f.label} {...f} />
          ))}
        </div>

        {noData ? (
          <EmptyState
            title="Engagement is what happened after the send"
            description={`Nothing has left ${scope === "all" ? "this workspace" : `the ${scope} wing`} in the last ${a.window_days} days. Send one real message and this fills in as the provider reports back — delivery within seconds, opens and clicks as they happen.`}
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trends · last {a.window_days} days</CardTitle>
              </CardHeader>
              <CardContent>
                {/* The journey as lines, day by day — sent, delivered, opened,
                    clicked move together when things are healthy. */}
                <TrendChart
                  dates={a.series.map((d) => d.date)}
                  series={[
                    { label: "Sent", className: "text-muted-foreground/70", values: a.series.map((d) => d.sent) },
                    { label: "Delivered", className: "text-witnessed", values: a.series.map((d) => d.delivered ?? 0) },
                    { label: "Opened", className: "text-muted-foreground", values: a.series.map((d) => d.opened ?? 0) },
                    { label: "Clicked", className: "text-muted-foreground", values: a.series.map((d) => d.clicked ?? 0) },
                  ]}
                />
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
