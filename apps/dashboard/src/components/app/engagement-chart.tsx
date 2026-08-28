// How one person's engagement is going — every email we sent them, oldest to
// newest, as a column whose height and shade say how deep they went.
//
// WHY THIS FORM. The other charts in the app plot a continuous series over days
// (see trend-chart.tsx). That is wrong for one contact: the data is a handful of
// discrete events, and bucketing twenty emails into months yields two bars that
// hide the very thing you came to see. So each email keeps its own mark, in
// order, and the shape reads directly — rising = warming up, falling off a cliff
// = a relationship going quiet.
//
// WHY ONE HUE. sent → opened → clicked is an ORDERED scale, not three separate
// things, so it takes one hue getting darker rather than three colours. The page
// previously drew it blue → violet → blue, which is a hue jump in the middle of
// a progression; run against the ordinal checks that pair fails outright
// ("adjacent ΔL: steps too close"). These steps pass in both modes: on light the
// lightest step still clears 2:1 against the card, on dark the darkest does.
//
// Height and shade encode the same thing on purpose. Colour alone would strand
// anyone who can't separate the steps, and the column heights carry the story on
// their own.

import { cn } from "@/lib/utils";

export interface EngagementPoint {
  id: string;
  subject: string;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
}

/** How far they got with one email. The ordinal scale the chart encodes. */
type Depth = 0 | 1 | 2;
const DEPTH_LABEL = ["Sent, not opened", "Opened", "Clicked"] as const;

// One ink ramp, more-is-darker. It was three blues; blue asserts nothing about
// state, and an ordinal scale needs one hue at three weights anyway — which
// `--ink` at three opacities gives in BOTH themes, where a hardcoded
// blue-400/blue-700 pair only ever worked in one.
const DEPTH_FILL = ["fill-ink/25", "fill-ink/55", "fill-ink"] as const;
const DEPTH_SWATCH = ["bg-ink/25", "bg-ink/55", "bg-ink"] as const;

function depthOf(m: EngagementPoint): Depth {
  if (m.clicked_at) return 2;
  if (m.opened_at) return 1;
  return 0;
}

const H = 64;
const GAP = 2; // the surface gap that keeps adjacent bars from fusing
const RADIUS = 2;

export function EngagementChart({ messages }: { messages: EngagementPoint[] }) {
  // Oldest → newest, so the chart reads the way time does.
  const points = [...messages].sort((a, b) => (a.sent_at < b.sent_at ? -1 : 1));
  if (points.length === 0) return null;

  const opened = points.filter((m) => m.opened_at).length;
  const clicked = points.filter((m) => m.clicked_at).length;

  // A fixed slot width keeps bars honest when there are only two or three
  // emails — stretching four marks across the full width would imply a density
  // of data we do not have.
  const slot = 18;
  const w = Math.max(points.length * slot, slot);
  const barW = slot - GAP;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {DEPTH_LABEL.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", DEPTH_SWATCH[i])} />
            {label}
            <span className="font-semibold tabular-nums text-foreground">
              {i === 2 ? clicked : i === 1 ? opened - clicked : points.length - opened}
            </span>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${H}`}
          width={w}
          height={H}
          className="max-w-full"
          role="img"
          aria-label={`${points.length} emails to this contact, oldest to newest. ${opened} opened, ${clicked} clicked.`}
        >
          {points.map((m, i) => {
            const d = depthOf(m);
            // Three tiers → three heights. The shortest still has presence:
            // "we sent it and nothing happened" is a real observation, not a gap.
            const h = [H * 0.28, H * 0.62, H][d];
            return (
              <rect
                key={m.id}
                x={i * slot}
                y={H - h}
                width={barW}
                height={h}
                rx={RADIUS}
                className={DEPTH_FILL[d]}
              >
                {/* Native tooltip: no JS, works on keyboard focus and in print. */}
                <title>{`${fmt(m.sent_at)} · ${m.subject} — ${DEPTH_LABEL[d]}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{fmt(points[0].sent_at)}</span>
        <span>{points.length > 1 ? fmt(points[points.length - 1].sent_at) : null}</span>
      </div>
    </div>
  );
}
