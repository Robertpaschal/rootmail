import { AlertTriangle, Globe, OctagonX } from "lucide-react";
import { cn } from "@/lib/utils";
import { readDrift } from "@/lib/reputation";
import type { SubTenant } from "@/lib/types";

/**
 * Shown only when this client's DNS has actually drifted.
 *
 * The whole value is the window: between a record disappearing and our stopping
 * their sending there are a few hours in which the fix is one paste into a DNS
 * panel. A screen that just said "failed" would spend that window telling them
 * nothing they can act on — so this leads with the record and the deadline.
 */
export function DnsDriftPanel({ st }: { st: SubTenant }) {
  const drift = readDrift(st);
  if (!drift) return null;

  return (
    <section
      className={cn(
        "rounded-lg border p-5",
        drift.stopped
          ? "border-stopped bg-stopped-tint"
          : "border-acted bg-acted-tint",
      )}
    >
      <div className="flex items-start gap-3">
        {drift.stopped ? (
          <OctagonX className="mt-0.5 size-5 shrink-0 text-stopped" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-acted" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{drift.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{drift.effect}</p>

          {drift.detail ? (
            <div className="mt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Globe className="size-3.5" /> What we looked for
              </p>
              {/* Wrapped, not truncated: a DKIM value is long and useless in part,
                  and this is the string they have to put back. */}
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-background/70 p-3 font-mono text-xs leading-relaxed">
                {drift.detail}
              </pre>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            We re-check every verified domain hourly. Once the record resolves again this clears by
            itself — there is nothing to press here.
          </p>
        </div>
      </div>
    </section>
  );
}
