import { CheckCircle2, Eye, MousePointerClick, Send, TriangleAlert } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Analytics } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function AnalyticsPage() {
  let a: Analytics;
  try {
    a = await api.getAnalytics({ window_days: 30 });
  } catch (err) {
    return (
      <>
        <PageHeader title="Analytics" description="Who received, opened, and clicked — across everything you send." />
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

  return (
    <>
      <PageHeader title="Analytics" description={`Engagement across your sends over the last ${a.window_days} days.`} />

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
      </div>
    </>
  );
}
