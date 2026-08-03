import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One task, on its own, with the way back.
 *
 * The pattern this replaces: an empty state announcing "no audiences yet",
 * with the create form sitting open underneath it. Two things claiming the
 * screen — the first telling you there's nothing here, the second contradicting
 * it — and the actual work pushed below the fold. It read as a page that hadn't
 * decided what it was for.
 *
 * When someone has chosen to do a thing, show them that thing. The empty state
 * has done its job by then and should get out of the way.
 *
 * The caller drives this from the URL (`?add=one`, `?create=1`), so the focused
 * view is linkable, survives a refresh, and the browser's Back button does what
 * `backHref` does — which is why the way out is a link and not a bit of state.
 */
export function FocusedTask({
  title,
  description,
  backHref,
  backLabel = "Back",
  children,
}: {
  title: string;
  description?: string;
  backHref: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {backLabel}
        </Link>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}
