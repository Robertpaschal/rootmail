import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A screen with nothing on it yet.
 *
 * Two rules from `docs/design/00-PHILOSOPHY.md` §4 decide how this looks. The
 * first is about words: a headline that names the absence of a thing ("No staff
 * yet") carries no information, so the `title` here says what the thing DOES
 * and the `description` says what will fill it. The second is about the icon:
 * it used to sit in a 2xl rounded chip, which is the one shape in this console
 * that is neither a record's 4px corner nor a station node's circle. It is now
 * a plain mark in muted ink above a hairline, so an empty table reads as a
 * ruled record with no rows rather than as an illustration.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  /** Says what the thing does. Never "No <thing> yet". */
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {Icon ? <Icon className="size-5 text-ink-muted" aria-hidden /> : null}
      <div className="space-y-1">
        <p className="text-[0.95rem] font-medium tracking-heading">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <span aria-hidden className="block h-px w-10 bg-rule" />
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
