import type { ReactNode } from "react";
import { Line } from "@rootmail/design";

/**
 * What a surface says before it has anything to show.
 *
 * It used to be a centered, bordered card with a tinted icon chip — i.e. the
 * identical object as the marketing site's feature grid, which meant the moment
 * a rootmail operator had no data the product looked exactly like its own
 * landing page. It is a left-aligned block under a hairline now, and the only
 * ornament is a dotted line: this system already has a drawing for "nothing has
 * happened here yet", and it is the same dotted segment the roadmap and the
 * un-verified DNS record use (docs/design/00-PHILOSOPHY.md §5.5).
 *
 * The COPY rule matters more than any of that: a headline that names the
 * absence of a thing carries no information. "No templates yet" is not a
 * sentence. Every title here is a claim about what the thing does.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-t py-10">
      <div className="flex items-center gap-3 text-muted-foreground">
        {icon}
        <Line
          stations={[
            { label: "not yet", state: "unknown" },
            { label: "not yet", state: "unknown" },
            { label: "not yet", state: "unknown" },
          ]}
          label="Nothing has been recorded here yet"
        />
      </div>
      <h3 className="mt-4 max-w-xl text-xl font-medium leading-tight tracking-heading">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
