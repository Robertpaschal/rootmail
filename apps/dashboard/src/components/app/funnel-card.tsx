import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MessageFunnelStats } from "@/lib/types";

// The engagement funnel for one campaign/sequence: sent → delivered → opened →
// clicked as proportional bars, with the derived rates underneath. Bars scale to
// "sent" so drop-off reads at a glance.
/**
 * Four bars used to be four hues (blue / emerald / violet / blue), which drew a
 * provider confirmation and a tracking pixel at identical confidence. Only
 * `delivered` is witnessed, so only `delivered` is green. The two inferences
 * are an ink ramp and they SAY they are inferences — an inference presented in
 * the same weight as an observation is the industry's founding lie
 * (docs/design/00-PHILOSOPHY.md §1).
 */
const STAGES: {
  key: keyof MessageFunnelStats["funnel"];
  label: string;
  bar: string;
  method: string;
  inferred?: boolean;
}[] = [
  { key: "sent", label: "Sent", bar: "bg-ink/30", method: "api+worker" },
  { key: "delivered", label: "Delivered", bar: "bg-witnessed", method: "provider confirmation" },
  { key: "opened", label: "Opened", bar: "bg-ink/45", method: "tracking pixel", inferred: true },
  { key: "clicked", label: "Clicked", bar: "bg-ink/70", method: "link redirect", inferred: true },
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
            The first send fills this in. Delivery comes from the provider; opens and clicks are
            inferred from a pixel and a redirect, and are drawn as inferences.
          </p>
        ) : (
          <>
            <div className="space-y-2.5">
              {STAGES.map((s) => {
                const v = stats.funnel[s.key];
                return (
                  <div key={s.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="truncate font-mono text-[12px] text-muted-foreground" data-fact>
                        {s.method}
                        {s.inferred ? " · inferred" : ""}
                      </span>
                      <span
                        className={`ml-auto tabular-nums ${s.inferred ? "text-ink-muted" : "text-muted-foreground"}`}
                        data-fact
                      >
                        {v.toLocaleString()}
                      </span>
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
              <span className="text-witnessed">
                Delivery {stats.rates.delivery}%
              </span>
              <span className="text-muted-foreground">Open {stats.rates.open}% · inferred</span>
              <span className="text-muted-foreground">Click {stats.rates.click}% · inferred</span>
              {stats.rates.bounce > 0 ? (
                <span className="text-stopped">Bounce {stats.rates.bounce}%</span>
              ) : null}
            </div>
          </>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
