import type { ReactNode } from "react";

/**
 * One consistent page header for every admin section — title, optional
 * description, and a right-aligned actions slot. Replaces the ad-hoc
 * `<h1>/<p>` each page used to hand-roll, so the console reads as one product.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-prose text-base leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
