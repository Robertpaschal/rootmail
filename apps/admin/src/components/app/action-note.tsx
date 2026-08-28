import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "It worked" — stated, not coloured.
 *
 * Nine forms in this console each grew their own `text-emerald-600` span to say
 * a save landed, a credit posted, a promotion was created. That green was doing
 * two jobs at once and neither well: it had no dark-mode counterpart (this
 * console is dark-only, so it was a mid-green on near-black), and it spent the
 * one colour that is reserved, product-wide, for *what happened to a message*.
 * By the time a staff member saw green beside a real delivery they had already
 * seen it beside "Saved".
 *
 * So the confirmation is a mark and a fact in ink. The exception is `witnessed`,
 * for the one case where the outcome genuinely IS a message the pipeline
 * accepted — a support reply going out. There the signal colour is not
 * decoration; it is the same claim the customer's own console makes.
 *
 * Failures are not handled here. They keep `text-destructive`, which in this
 * console already resolves to `--stopped`.
 */
export function ActionNote({
  children,
  tone = "record",
  className,
}: {
  children: ReactNode;
  /** `witnessed` only when the outcome is a message we saw accepted. */
  tone?: "record" | "witnessed";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        tone === "witnessed" ? "text-witnessed" : "text-ink",
        className,
      )}
    >
      <Check className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
