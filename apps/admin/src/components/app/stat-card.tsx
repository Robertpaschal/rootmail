import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tone = "slate" | "blue" | "green" | "amber" | "violet" | "rose";

// Semantic color for data tiles — a tinted icon chip + (when accented) a matching
// ring. Tailwind palette so it reads in both the light + near-black dark themes.
const ICON_TONE: Record<Tone, string> = {
  slate: "bg-muted text-muted-foreground",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const RING_TONE: Record<Tone, string> = {
  slate: "ring-border",
  blue: "ring-blue-500/30",
  green: "ring-emerald-500/30",
  amber: "ring-amber-500/40",
  violet: "ring-violet-500/30",
  rose: "ring-rose-500/40",
};

/** A KPI tile for the overview + section summaries. Optionally links somewhere. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone = "slate",
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  tone?: Tone;
  accent?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ICON_TONE[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </>
  );

  const className = cn(
    "rounded-xl border bg-card p-4 transition-colors",
    accent && cn("ring-1", RING_TONE[tone]),
    href && "hover:border-primary/40",
  );

  return href ? (
    <Link href={href} className={cn(className, "block")}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
