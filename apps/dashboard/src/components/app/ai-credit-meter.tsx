import Link from "next/link";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Credits {
  used: number;
  allowance: number;
  remaining: number; // -1 = unlimited
}

const BUY_HREF = "/billing/addons?focus=ai_credit_pack";

/** When to warn "running low": ≤20% left, or ≤10 credits, whichever triggers first. */
export function isLowCredits(c: Credits): boolean {
  if (c.allowance === -1) return false;
  if (c.remaining <= 0) return false; // "out" is handled separately
  return c.remaining <= Math.max(10, Math.ceil(c.allowance * 0.2));
}
export function isOutOfCredits(c: Credits): boolean {
  return c.allowance !== -1 && c.remaining <= 0;
}

/** A compact one-line meter (used / allowance) with a slim bar. */
export function CreditMeter({ credits, className }: { credits: Credits; className?: string }) {
  if (credits.allowance === -1) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
        <Sparkles className="size-3" /> Unlimited AI credits
      </span>
    );
  }
  const pct = credits.allowance > 0 ? Math.min(100, (credits.used / credits.allowance) * 100) : 100;
  const low = isLowCredits(credits);
  const out = isOutOfCredits(credits);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground", className)}>
      <Zap className={cn("size-3 shrink-0", out ? "text-destructive" : low ? "text-amber-500" : "text-primary")} />
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", out ? "bg-destructive" : low ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums">{Math.max(0, credits.remaining)} left</span>
    </span>
  );
}

/**
 * The nudge banner: nothing when there's plenty, a gentle amber warning when
 * running low, and a firm block-style prompt when out. Shown in the assistant
 * page and the global launcher so credits are honest everywhere.
 */
export function CreditNudge({ credits, className }: { credits: Credits; className?: string }) {
  const out = isOutOfCredits(credits);
  const low = isLowCredits(credits);
  if (!out && !low) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
        out ? "border-destructive/40 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10",
        className,
      )}
    >
      <span className="min-w-0">
        {out ? (
          <>You&apos;re out of AI credits this month.</>
        ) : (
          <>
            Only <span className="font-medium">{credits.remaining}</span> AI{" "}
            {credits.remaining === 1 ? "credit" : "credits"} left this month.
          </>
        )}
      </span>
      <Link
        href={BUY_HREF}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium",
          out ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        Get more credits <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
