import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Fact, Line, type Station } from "@rootmail/design";
import type { Change, ChangeTone } from "@/lib/changes";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The product speaking first.
 *
 * Not a notification list and not an activity log — every entry is something
 * rootmail NOTICED and what it DID, carrying the quantity that triggered it and
 * a door to the fix. The rules it renders by:
 *
 *   · The actor is in the headline, and the headline is a sentence. "rootmail
 *     paused Sunset Villas", never "Sunset Villas — paused".
 *   · The two-station line on the left is the state, drawn: `acted` narrows,
 *     `stopped` severs, `unknown` goes dotted. It is the same rendering law as
 *     the message rows, which is the point of having one.
 *   · No number appears without its window and its method, in mono, because
 *     mono here means "this is a recorded value, not prose we wrote".
 *   · A `gap` is drawn, not hidden. An entry we cannot back renders dotted with
 *     the sentence naming what it would take to make it solid (§5.5).
 *
 * Rows, deliberately, not cards. 114 bordered boxes is what the dashboard had;
 * a ruled list is what a record looks like.
 */

const TONE_TEXT: Record<ChangeTone, string> = {
  acted: "text-acted",
  stopped: "text-stopped",
  witnessed: "text-witnessed",
  unknown: "text-muted-foreground",
};

/** Two stations: what was running, and what we did to it. */
function stationsFor(tone: ChangeTone): Station[] {
  if (tone === "stopped")
    return [
      { label: "sending", state: "witnessed" },
      { label: "stopped", state: "stopped" },
    ];
  if (tone === "unknown")
    return [
      { label: "known", state: "unknown" },
      { label: "not measured", state: "unknown" },
    ];
  if (tone === "witnessed")
    return [
      { label: "restricted", state: "witnessed" },
      { label: "sending", state: "witnessed" },
    ];
  return [
    { label: "sending", state: "witnessed" },
    { label: "we intervened", state: "inferred" },
  ];
}

export function ChangeRow({ change }: { change: Change }) {
  return (
    <li className="border-t py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Line
          stations={stationsFor(change.tone)}
          className="translate-y-0.5"
          label={`${change.actor}: ${change.headline}`}
        />
        <h3 className={cn("text-[15px] font-medium leading-snug", TONE_TEXT[change.tone])}>
          {change.headline}
        </h3>
        {change.at ? (
          <Fact className="ml-auto shrink-0 text-[12.5px] text-muted-foreground">
            {relativeTime(change.at)}
          </Fact>
        ) : (
          <Fact className="ml-auto shrink-0 text-[12.5px] text-muted-foreground">still true</Fact>
        )}
      </div>

      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {change.detail}
      </p>

      {change.metric ? (
        <p className="mt-2 font-mono text-[12.5px] leading-snug text-muted-foreground" data-fact>
          <span className="text-foreground">{change.metric.value}</span>
          {" · "}
          {change.metric.label}
          {" · "}
          {change.metric.window}
          {" · "}
          {change.metric.method}
          {change.metric.threshold ? (
            <>
              {" · "}
              <span className={TONE_TEXT[change.tone]}>{change.metric.threshold}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {change.gap ? (
        // The honest gap: what this entry would need in order to become a
        // number. Drawn, not hidden — a product confident enough to show its
        // own edge is more credible than one pretending it has none.
        <p className="mt-2 border-l-2 border-dashed border-rule pl-3 font-mono text-[12.5px] leading-snug text-muted-foreground">
          {change.gap}
        </p>
      ) : null}

      {change.action ? (
        <Link
          href={change.action.href}
          className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {change.action.label} <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </li>
  );
}

export function ChangeFeed({
  changes,
  quiet,
  className,
}: {
  changes: Change[];
  /** What to say when nothing crossed a line — the good outcome, not an error. */
  quiet: string;
  className?: string;
}) {
  if (changes.length === 0) {
    return (
      <div className={cn("border-t py-8", className)}>
        <div className="flex items-center gap-3">
          <Line
            stations={[
              { label: "watching", state: "witnessed" },
              { label: "watching", state: "witnessed" },
              { label: "watching", state: "witnessed" },
            ]}
            label="Nothing crossed a line"
          />
          <h3 className="text-[15px] font-medium">Nothing needed doing</h3>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{quiet}</p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-0", className)}>
      {changes.map((c) => (
        <ChangeRow key={c.id} change={c} />
      ))}
    </ul>
  );
}
