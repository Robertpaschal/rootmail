import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="ui-content-enter mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {backLabel ?? "Back"}
          </Link>
        ) : null}
        <h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-prose text-base leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div> : null}
    </div>
  );
}
