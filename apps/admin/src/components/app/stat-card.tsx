import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** A KPI tile for the overview + section summaries. Optionally links somewhere. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </>
  );

  const className = cn(
    "rounded-xl border bg-card p-4 transition-colors",
    accent && "ring-1 ring-primary/20",
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
