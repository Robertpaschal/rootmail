import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * A chip. Its variants are the RENDERING LAW from `docs/design/00-PHILOSOPHY.md`
 * §3, not a palette — which is why there is no `success`/`warning`/`error` here
 * any more. Those names invited a chip to be coloured because a thing felt good
 * or bad; these names only let it be coloured because we can say what we saw.
 *
 *   witnessed  a provider confirmed it, or we did it ourselves
 *   inferred   we guessed — a pixel fired, a heuristic matched. Drawn HOLLOW:
 *              outline, ink text, no fill, matching the line's hollow node.
 *   acted      we intervened (suppressed, throttled, in a grace window)
 *   stopped    it ended, and a number says why
 *
 * Everything that is not a state — a plan name, a wing, a role, a content
 * kind — takes `outline` or `muted` and is told apart by its label, per §9.7.
 * Corners, not circles: nodes on a line are the only circles in the product.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-rule bg-secondary text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        muted: "border-border bg-muted text-muted-foreground",

        witnessed: "border-transparent bg-witnessed-tint text-witnessed",
        inferred: "border-ink/40 bg-transparent text-foreground",
        acted: "border-transparent bg-acted-tint text-acted",
        stopped: "border-transparent bg-stopped-tint text-stopped",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
