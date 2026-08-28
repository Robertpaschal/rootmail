import type { ComponentType } from "react";
import Link from "next/link";
import { Metric } from "@rootmail/design";
import { cn } from "@/lib/utils";

/**
 * A data tile for the staff console.
 *
 * It used to take a `tone` — blue, green, amber, violet, rose — and paint a
 * tinted chip behind its icon. That is precisely the thing §5.2 forbids: five
 * saturated colours carrying no claim, spent on decoration, so that by the time
 * something on the same screen genuinely WAS amber ("we intervened") the colour
 * had no meaning left to spend. The tones are gone and the icon is plain ink.
 *
 * What replaced them is stricter, not looser. The tile is a `<Metric>` from
 * `@rootmail/design`, whose `window` and `method` are REQUIRED BY TYPE — so a
 * staff member reading "1,204" can always see the window it covers and where it
 * came from, and no naked number can be added to this console without someone
 * deleting a required prop and noticing why they shouldn't. Numbers here decide
 * whether to suspend a paying customer's domain; they arrive sourced.
 */
export function StatCard({
  label,
  value,
  window,
  method,
  threshold,
  caveat,
  inferred,
  icon: Icon,
  href,
  className,
}: {
  /** What is being counted, lowercase: "organizations", "open tickets". */
  label: string;
  value: string | number;
  /** The window it covers: "all time", "this period", "30d". */
  window: string;
  /** Where it came from: "orgs table", "provider feedback", "stripe". */
  method: string;
  /** A threshold worth printing beside it: "warn at 2%". */
  threshold?: string;
  /** Names a bias or a qualification. Required when `inferred`. */
  caveat?: string;
  /** True only for a number we did not observe. Renders at reduced ink. */
  inferred?: boolean;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      {Icon ? (
        <Icon className="absolute right-3 top-3 size-4 text-ink-muted/60" aria-hidden />
      ) : null}
      {inferred ? (
        <Metric
          value={value}
          label={label}
          window={window}
          method={method}
          threshold={threshold}
          inferred
          caveat={caveat ?? "inferred"}
        />
      ) : (
        <Metric
          value={value}
          label={label}
          window={window}
          method={method}
          threshold={threshold}
          caveat={caveat}
        />
      )}
    </>
  );

  const box = cn(
    "relative rounded-lg border bg-card p-4",
    href && "transition-colors duration-interaction ease-interaction hover:border-ink/40",
    className,
  );

  return href ? (
    <Link href={href} className={cn(box, "block")}>
      {inner}
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}
