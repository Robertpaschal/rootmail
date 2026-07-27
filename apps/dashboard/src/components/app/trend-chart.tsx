// A dependency-free multi-line trend chart (pure SVG, server-renderable).
// Lines share one y-scale; the legend carries each series' latest value so the
// chart reads without hovering. Used by Analytics (engagement trend) and
// Deliverability (delivery-health trend).

import { cn } from "@/lib/utils";

export interface TrendSeries {
  label: string;
  /** Tailwind text-* class — strokes/fills use currentColor. */
  className: string;
  values: number[];
}

const W = 600;
const H = 160;
const PAD = 6;

function pathFor(values: number[], max: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = PAD + i * step;
      const y = H - PAD - (max > 0 ? (v / max) * (H - PAD * 2) : 0);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendChart({
  dates,
  series,
  yMax,
}: {
  dates: string[];
  series: TrendSeries[];
  /** Fix the scale (e.g. 100 for percentages); defaults to the data's max. */
  yMax?: number;
}) {
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.values));
  const gridYs = [0.25, 0.5, 0.75].map((f) => H - PAD - f * (H - PAD * 2));

  return (
    <div>
      {/* Legend with the latest value per series — the chart's own caption. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full bg-current", s.className)} />
            {s.label}
            <span className="font-semibold tabular-nums text-foreground">
              {(s.values[s.values.length - 1] ?? 0).toLocaleString()}
            </span>
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`Trend of ${series.map((s) => s.label).join(", ")} over ${dates.length} days`}
      >
        {gridYs.map((y) => (
          <line key={y} x1={PAD} x2={W - PAD} y1={y} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray="2 4" />
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={pathFor(s.values, max)}
            fill="none"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={cn("stroke-current", s.className)}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}
