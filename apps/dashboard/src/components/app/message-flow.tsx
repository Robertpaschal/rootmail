import { Line, messageStations, type Station } from "@rootmail/design";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The per-row lifecycle line: Queued → Sent → Delivered → Opened → Clicked.
 *
 * The DATA MODEL here was always right and is unchanged — the furthest thing
 * that actually happened is read from the engagement timestamps, because the
 * stored status caps at "delivered" and an opened email would otherwise read
 * "delivered" in every list forever.
 *
 * The RENDERING was wrong, in two ways that `docs/design/00-PHILOSOPHY.md` §9.8
 * calls false claims rather than styling bugs:
 *
 *   1. `Opened` was a filled emerald dot, identical to `Delivered`. An open is a
 *      tracking pixel firing and roughly a third of them are a mail client
 *      prefetching an image; drawing an inference in the same weight and colour
 *      as a provider confirmation is the industry's founding lie. It is hollow
 *      now, and `messageStations()` makes it impossible for a caller to promote.
 *   2. A bounce / complaint / failure / suppression DELETED the line and
 *      substituted a badge — throwing away every witnessed step before the stop.
 *      The line is severed in place now, keeping what we saw, with the reason
 *      beside it.
 *
 * The badge is gone from this component on purpose. A chip carries no position;
 * a severed bar says exactly where it ended.
 */

type FlowInput = Pick<Message, "status" | "opened_at" | "clicked_at"> &
  Partial<Pick<Message, "error" | "created_at">>;

const DEAD = new Set(["bounced", "complained", "failed", "suppressed"]);
/** Statuses that mean a provider took the mail off our hands. */
const HANDED_OVER = new Set(["sent", "delivered", "bounced", "complained"]);

/** Truthy marker meaning "this happened", used where no timestamp is available. */
const SEEN = "y";

const STOP_LABEL: Record<string, string> = {
  bounced: "Bounced",
  complained: "Marked spam",
  failed: "Couldn't send",
  suppressed: "Not sent",
};

/**
 * A `Message` as the line's stations. Exported because the detail page and any
 * other page-scale surface must draw the SAME stations as the row that led
 * there — two components computing the line independently is how they drift.
 */
export function stationsFor(
  m: FlowInput,
  times: { sentAt?: string | null; deliveredAt?: string | null } = {},
): Station[] {
  const dead = DEAD.has(m.status);
  // `messageStations` reads a truthy value as "witnessed". At row scale we have
  // no timestamps, only the status — so a sentinel carries the fact without
  // inventing a time, and the real timestamps (from the audit trail) are passed
  // in wherever the surface has them.
  const sentAt = times.sentAt ?? (HANDED_OVER.has(m.status) ? SEEN : null);
  const deliveredAt =
    times.deliveredAt ?? (m.status === "delivered" || m.opened_at || m.clicked_at ? SEEN : null);

  // `SEEN` is a state marker, never a display value. `messageStations` reads any
  // truthy value as "witnessed" AND copies it into `at`, so letting the sentinel
  // through rendered a station labelled "Sent" with the timestamp "y" under it,
  // live on the message page. It is stripped below.
  const stations = messageStations({
    status: m.status,
    sentAt,
    deliveredAt,
    openedAt: m.opened_at,
    clickedAt: m.clicked_at,
    stoppedReason: dead ? (m.error ?? null) : null,
  }).map((s) => {
    // Never let the sentinel reach the screen.
    const cleaned: Station = s.at === SEEN ? { ...s, at: undefined } : s;
    // `messageStations` title-cases the raw status for the severed station;
    // "Complained" and "Suppressed" are our words, not the operator's.
    return cleaned.state === "stopped"
      ? { ...cleaned, label: STOP_LABEL[m.status] ?? cleaned.label }
      : cleaned;
  });

  if (!dead) return stations;

  // Nothing happened after the stop, so nothing after it is drawn — a hopeful
  // grey continuation past a bounce is the flattering lie this system refuses.
  const stopAt = stations.findIndex((s) => s.state === "stopped");
  const severed = stations.slice(0, stopAt + 1);

  // A complaint arrives AFTER delivery, and `messageStations` puts the severed
  // station where `Delivered` would be. Dropping a delivery we witnessed in
  // order to draw the stop would throw away observed history — which is the
  // exact defect this component was rewritten to fix — so it is put back.
  if (m.status === "complained" && deliveredAt) {
    severed.splice(stopAt, 0, {
      label: "Delivered",
      state: "witnessed",
      at: times.deliveredAt ?? undefined,
    });
  }
  return severed;
}

/** The furthest thing that actually happened, and how sure we are of it. */
function furthest(stations: Station[]): { label: string; state: Station["state"] } {
  const stopped = stations.find((s) => s.state === "stopped");
  if (stopped) return { label: stopped.label, state: "stopped" };
  const reached = [...stations].reverse().find((s) => s.state !== "unknown");
  if (reached) return { label: reached.label, state: reached.state };
  const inflight = stations.find((s) => s.inFlight);
  return { label: inflight ? "Sending" : "Queued", state: "unknown" };
}

export function MessageFlow({ message }: { message: FlowInput }) {
  const stations = stationsFor(message);
  const { label, state } = furthest(stations);
  const title = stations
    .map((s) => (s.state === "unknown" ? `${s.label} (not yet)` : s.label))
    .join(" → ");

  return (
    <span className="inline-flex items-center gap-2.5" title={title}>
      <Line stations={stations} />
      <span className="min-w-0">
        <span
          className={cn(
            "text-xs font-medium",
            state === "witnessed" && "text-witnessed",
            state === "stopped" && "text-stopped",
            // An inference is never drawn at full ink next to something we
            // witnessed. Hollow node, muted word — the same claim, twice.
            (state === "inferred" || state === "unknown") && "text-ink-muted",
          )}
        >
          {label}
        </span>
        {state === "stopped" && message.error ? (
          <span
            className="ml-1.5 truncate font-mono text-[10px] text-muted-foreground"
            data-fact
            title={message.error}
          >
            {message.error}
          </span>
        ) : null}
      </span>
    </span>
  );
}
