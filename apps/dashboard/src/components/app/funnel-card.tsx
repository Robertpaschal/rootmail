import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MessageFunnelStats } from "@/lib/types";

// The engagement funnel for one campaign/sequence: sent → delivered → opened →
// clicked as proportional bars, with the derived rates underneath. Bars scale to
// "sent" so drop-off reads at a glance.
const STAGES: { key: keyof MessageFunnelStats["funnel"]; label: string; bar: string }[] = [
  { key: "sent", label: "Sent", bar: "bg-blue-400" },
  { key: "delivered", label: "Delivered", bar: "bg-emerald-500" },
  { key: "opened", label: "Opened", bar: "bg-violet-500" },
  { key: "clicked", label: "Clicked", bar: "bg-blue-600" },
];

export function FunnelCard({
  stats,
  title = "Engagement",
  children,
}: {
  stats: MessageFunnelStats;
  title?: string;
  children?: React.ReactNode;
}) {
  const max = Math.max(1, stats.funnel.sent);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet — engagement appears here after the first send.
          </p>
        ) : (
          <>
            <div className="space-y-2.5">
              {STAGES.map((s) => {
                const v = stats.funnel[s.key];
                return (
                  <div key={s.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">{v.toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full ${s.bar}`}
                        style={{ width: `${Math.round((v / max) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">
                Delivery {stats.rates.delivery}%
              </span>
              <span className="text-violet-600 dark:text-violet-400">Open {stats.rates.open}%</span>
              <span className="text-blue-600 dark:text-blue-400">Click {stats.rates.click}%</span>
              {stats.rates.bounce > 0 ? (
                <span className="text-rose-600 dark:text-rose-400">Bounce {stats.rates.bounce}%</span>
              ) : null}
            </div>
          </>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
