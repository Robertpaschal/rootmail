import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * THE LINE — rootmail's signature device. See `docs/design/00-PHILOSOPHY.md` §3.
 *
 * Every email is a line from a sender to a person. This component draws that
 * line, and its four states are a RENDERING LAW, not a style choice:
 *
 *   witnessed  solid stroke, filled node    a provider confirmed it, or we did it
 *   inferred   solid stroke, HOLLOW node    we guessed — a pixel fired, a heuristic
 *   unknown    dashed stroke, dim           we do not know / not reached / not built
 *   stopped    stroke ends, node is a bar   it ended here, and a number says why
 *
 * The law that matters: **we never draw a solid line through something we did
 * not observe.** An open is a tracking pixel firing and roughly a third of them
 * are a mail client prefetching an image, so an `opened` station is `inferred`
 * and renders hollow — forever, everywhere. That single rule is what stops this
 * product from looking like every other email dashboard, and it is also the
 * honesty policy in executable form.
 *
 * ACCESSIBILITY / MOTION
 * The line is an image with a real label, never decoration. Nothing here is
 * revealed by animation: the only motion is a travelling dash on a stroke that
 * is already fully drawn, so a frozen `requestAnimationFrame` (the browser
 * preview pane, any background tab) costs nothing legible. Callers rendering a
 * line at `page` or `hero` scale should also render the underlying events as
 * plain rows — the line is an enhancement over readable content, not a
 * replacement for it.
 */

export type StationState = "witnessed" | "inferred" | "unknown" | "stopped";

export type Station = {
  /** Human label, e.g. "Delivered". Used in the accessible description. */
  label: string;
  state: StationState;
  /** Preformatted timestamp or value shown under the label at page/hero scale. */
  at?: string;
  /** Why it stopped. Only meaningful on a `stopped` station; it is the number
   *  that caused the stop, e.g. "complaint rate 0.52% · threshold 0.5%". */
  reason?: string;
  /** Renders the travelling-dash treatment: this segment is in flight now. */
  inFlight?: boolean;
};

type Scale = "inline" | "page" | "hero";

const SCALE: Record<
  Scale,
  { gap: number; node: number; stroke: number; labels: boolean; knockout: number }
> = {
  // Inline sits in a table row, so it is nodes-only, tight, and takes no
  // knockout — at a 6px node a ground-coloured ring is just noise.
  inline: { gap: 24, node: 6, stroke: 1.5, labels: false, knockout: 0 },
  // `knockout` is a ground-coloured ring that lets the node sit ON the stroke
  // with no seam where the two colours differ (a witnessed node arriving after
  // a dashed unknown segment, say). Measured off Resend, which does this with
  // `0 0 0 8px <ground>`; it must use the ground token and never white, or it
  // breaks on any inverted section.
  page: { gap: 64, node: 8, stroke: 2, labels: true, knockout: 2 },
  hero: { gap: 120, node: 10, stroke: 2, labels: true, knockout: 3 },
};

const STROKE: Record<StationState, string> = {
  witnessed: "hsl(var(--witnessed))",
  inferred: "hsl(var(--ink))",
  unknown: "hsl(var(--line-dim))",
  stopped: "hsl(var(--stopped))",
};

function describe(stations: Station[]): string {
  return stations
    .map((s) => {
      if (s.state === "stopped") return `${s.label} — stopped${s.reason ? `: ${s.reason}` : ""}`;
      if (s.state === "inferred") return `${s.label} (inferred)`;
      if (s.state === "unknown") return `${s.label} (not yet)`;
      return s.label;
    })
    .join(", then ");
}

export function Line({
  stations,
  scale = "inline",
  className,
  label,
  activeIndex,
}: {
  stations: Station[];
  scale?: Scale;
  className?: string;
  /** Overrides the generated accessible description. */
  label?: string;
  /**
   * Draws everything PAST this station at reduced weight, so a scrubbing
   * cursor reads as a position along the line rather than a highlight on it.
   * Purely presentational — it never changes a station's state, because the
   * state is a claim about what happened and a cursor cannot alter that.
   */
  activeIndex?: number;
}) {
  const { gap, node, stroke, labels, knockout } = SCALE[scale];
  const pad = node + stroke;
  const width = pad * 2 + gap * Math.max(stations.length - 1, 0);
  const height = pad * 2;
  const y = pad;

  // The line dies at the first `stopped` station: nothing after it happened,
  // so nothing after it is drawn. Drawing a hopeful grey continuation past a
  // bounce is exactly the kind of flattering lie this system exists to refuse.
  const stopAt = stations.findIndex((s) => s.state === "stopped");
  const lastDrawn = stopAt === -1 ? stations.length - 1 : stopAt;

  // Labels are centred on their station, so the first and last overhang the
  // stroke by up to half a gap. That overhang used to be applied as a negative
  // margin, which pushed the first label outside the component's own box and
  // let any `overflow-x-auto` ancestor clip it — "Queued" rendered as "ueued".
  // Reserving the overhang as padding makes the box honest about its own width.
  const overhang = labels ? Math.max(0, gap / 2 - pad) : 0;

  return (
    <span
      className={cx("inline-flex flex-col gap-1.5", className)}
      style={overhang ? { paddingLeft: overhang, paddingRight: overhang } : undefined}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={label ?? describe(stations)}
        className="overflow-visible"
      >
        {stations.slice(0, lastDrawn + 1).map((s, i) => {
          if (i === 0) return null;
          const x1 = pad + gap * (i - 1);
          const x2 = pad + gap * i;
          // A segment is drawn in the manner of the station it arrives at:
          // reaching an unknown station is itself unknown.
          const unknown = s.state === "unknown";
          return (
            <line
              key={`seg-${i}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke={STROKE[s.state === "inferred" ? "witnessed" : s.state]}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={unknown ? "3 4" : s.inFlight ? "4 4" : undefined}
              opacity={activeIndex !== undefined && i > activeIndex ? 0.4 : 1}
              className={cx(
                "line-state",
                s.inFlight && "animate-line-travel motion-reduce:animate-none",
              )}
            />
          );
        })}

        {stations.map((s, i) => {
          const x = pad + gap * i;
          if (s.state === "stopped") {
            // A severed end is a bar across the line, not a dot. A dot reads as
            // "another step"; a bar reads as "this is where it ended".
            return (
              <line
                key={`n-${i}`}
                x1={x}
                y1={y - node}
                x2={x}
                y2={y + node}
                stroke={STROKE.stopped}
                strokeWidth={stroke + 0.5}
                strokeLinecap="round"
                className="line-state"
                opacity={activeIndex !== undefined && i > activeIndex ? 0.4 : 1}
              />
            );
          }
          const r = node / 2;
          const hollow = s.state === "inferred";
          return (
            <g
              key={`n-${i}`}
              className="line-state"
              opacity={activeIndex !== undefined && i > activeIndex ? 0.4 : 1}
            >
              {knockout > 0 && !hollow ? (
                <circle cx={x} cy={y} r={r + knockout / 2} fill="hsl(var(--background))" />
              ) : null}
              <circle
                className="line-state"
                cx={x}
                cy={y}
                r={r}
                fill={hollow ? "hsl(var(--background))" : STROKE[s.state]}
                stroke={hollow ? "hsl(var(--ink))" : "none"}
                strokeWidth={hollow ? stroke : 0}
              />
            </g>
          );
        })}
      </svg>

      {labels ? (
        <span className="relative block text-[12.5px] leading-tight" style={{ width, height: 28 }}>
          {stations.map((s, i) => (
            <span
              key={s.label + i}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5 text-center"
              style={{ left: pad + gap * i, width: gap }}
            >
              <span
                className={cx(
                  "font-medium",
                  s.state === "unknown" && "text-muted-foreground",
                  s.state === "stopped" && "text-stopped",
                )}
              >
                {s.label}
              </span>
              {s.at ? (
                <span className="font-mono text-[12px] text-muted-foreground" data-fact>
                  {s.at}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The five stations every message walks. `opened` and `clicked` are `inferred`
 * by construction — callers cannot promote them, which is the point.
 */
export function messageStations(m: {
  status: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  stoppedReason?: string | null;
}): Station[] {
  const dead = ["bounced", "complained", "failed", "suppressed"].includes(m.status);
  const seen = (v?: string | null): StationState => (v ? "witnessed" : "unknown");
  const guessed = (v?: string | null): StationState => (v ? "inferred" : "unknown");

  return [
    { label: "Queued", state: "witnessed" },
    {
      label: "Sent",
      state: m.status === "sending" ? "unknown" : seen(m.sentAt ?? (dead ? null : "y")),
      at: m.sentAt ?? undefined,
      inFlight: m.status === "sending",
    },
    dead
      ? { label: titleCase(m.status), state: "stopped", reason: m.stoppedReason ?? undefined }
      : { label: "Delivered", state: seen(m.deliveredAt), at: m.deliveredAt ?? undefined },
    { label: "Opened", state: guessed(m.openedAt), at: m.openedAt ?? undefined },
    { label: "Clicked", state: guessed(m.clickedAt), at: m.clickedAt ?? undefined },
  ];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

