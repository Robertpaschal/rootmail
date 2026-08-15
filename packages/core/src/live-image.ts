// Live-at-open images: an <img> in the email points here, and the PNG is drawn
// fresh on every fetch. That's the only mechanism for "live" content that works
// across mail clients — no client runs JavaScript, so anything that has to be
// current at read time has to be an image the server renders on demand.
//
// WHAT "LIVE" HONESTLY MEANS
// --------------------------
// The image is current as of the FETCH, which is not always the read:
//   - Apple's Mail Privacy Protection pre-fetches and caches images shortly
//     after delivery, so for those readers the image is frozen at pre-fetch
//     time, not at open. It can be hours stale.
//   - Gmail proxies images through googleusercontent and caches aggressively.
//   - Outlook on Windows blocks remote images by default, so a reader may see
//     only the alt text.
// Because of the first two, this renders DAYS / HOURS / MINUTES and refuses to
// render seconds: a ticking seconds field would be a lie in a static image that
// may have been fetched hours earlier. The alt text must always carry the same
// information in words — see `liveImageAlt`.
//
// The URL is HMAC-signed for the same reason the unsubscribe link is: without a
// signature this is an open image-rendering endpoint that anyone can point at
// arbitrary parameters and hammer.
//
// THE TOKEN DELIBERATELY DOES NOT EXPIRE
// --------------------------------------
// It carries no `exp` and none is enforced, which looks like an oversight and
// isn't. The token names a DEADLINE, and past that deadline the correct render
// is the expired label — someone opening a two-year-old email should read "This
// offer has ended", which is exactly what an unexpired token draws. An `exp`
// would replace that with a blank card and turn a good outcome into a broken
// one. Nothing here is a credential: the token authorises drawing a picture
// from parameters it already contains, reveals nothing, and touches no database,
// so a replayed one is only worth the CPU it burns — and that is bounded by the
// per-minute render budget in apps/api/src/routes/live.ts, which is where this
// endpoint's abuse story actually lives. The signature exists to stop STRANGERS
// choosing the parameters, not to expire our own.
//
// The real bounds are MAX_HORIZON_DAYS at signing time and MAX_DIGITS_VALUE at
// draw time. Note that rotating LINK_SIGNING_SECRET invalidates every live image
// in already-delivered mail (they fall back to the placeholder) — the same
// blast radius rotation already has for unsubscribe links.

import { GLYPH_H, GLYPH_W, glyph, textWidth } from "./bitmap-font";
import { hmacSign, safeEqual } from "./crypto";
import { env } from "./env";
import { Surface, rgb, type RGB } from "./png";

const SECRET = env.LINK_SIGNING_SECRET ?? "dev-insecure-link-signing-secret";

/** Units a countdown may display. Seconds are deliberately absent — see above. */
export type CountdownUnit = "days" | "hours" | "minutes";

/**
 * Furthest deadline a countdown may name. Past roughly a year it isn't a
 * countdown any more, and the far end of the range is where a typo'd year turns
 * into a six-digit day count that draws outside its tile.
 */
export const MAX_HORIZON_DAYS = 400;

export interface CountdownSpec {
  kind: "countdown";
  /** Deadline, epoch milliseconds. */
  deadline: number;
  /** Shown instead of the tiles once the deadline has passed. */
  expiredLabel?: string;
  /** Card background. */
  bg?: string;
  /** Tile background. */
  tile?: string;
  /** Numerals. */
  accent?: string;
  /** Unit labels. */
  label?: string;
  units?: CountdownUnit[];
}

export type LiveImageSpec = CountdownSpec;

// --- Signing -----------------------------------------------------------------

/** Compact wire form — the token rides in a URL, so keys are single letters. */
interface Wire {
  k: "c";
  d: number;
  x?: string;
  b?: string;
  t?: string;
  a?: string;
  l?: string;
  u?: string;
}

const UNIT_CODES: Record<CountdownUnit, string> = { days: "d", hours: "h", minutes: "m" };
const CODE_UNITS: Record<string, CountdownUnit> = { d: "days", h: "hours", m: "minutes" };

function toWire(spec: LiveImageSpec): Wire {
  return {
    k: "c",
    d: Math.round(spec.deadline),
    x: spec.expiredLabel,
    b: spec.bg,
    t: spec.tile,
    a: spec.accent,
    l: spec.label,
    u: spec.units?.map((u) => UNIT_CODES[u]).join(""),
  };
}

function fromWire(w: Wire): LiveImageSpec | null {
  if (w?.k !== "c" || typeof w.d !== "number" || !Number.isFinite(w.d)) return null;
  const units = typeof w.u === "string" ? [...w.u].map((c) => CODE_UNITS[c]).filter(Boolean) : undefined;
  return {
    kind: "countdown",
    deadline: w.d,
    expiredLabel: typeof w.x === "string" ? w.x : undefined,
    bg: typeof w.b === "string" ? w.b : undefined,
    tile: typeof w.t === "string" ? w.t : undefined,
    accent: typeof w.a === "string" ? w.a : undefined,
    label: typeof w.l === "string" ? w.l : undefined,
    units: units && units.length ? units : undefined,
  };
}

export function liveImageToken(spec: LiveImageSpec): string {
  const body = Buffer.from(JSON.stringify(toWire(spec))).toString("base64url");
  return `${body}.${hmacSign(body, SECRET)}`;
}

export function verifyLiveImageToken(token: string): LiveImageSpec | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacSign(body, SECRET))) return null;
  try {
    return fromWire(JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Wire);
  } catch {
    return null;
  }
}

/** Absolute URL for the rendered image. */
export function liveImageUrl(spec: LiveImageSpec): string {
  const base = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${base}/v1/live/image.png?t=${encodeURIComponent(liveImageToken(spec))}`;
}

/**
 * Alt text carrying the same information in words. Outlook blocks remote images
 * by default, so for those readers this IS the content — it is not optional.
 */
export function liveImageAlt(spec: LiveImageSpec, now = Date.now()): string {
  const parts = countdownParts(spec, now);
  if (!parts) return spec.expiredLabel ?? "This offer has ended";
  // Drop leading zero units so a 47-minute countdown reads "47 minutes left"
  // rather than "0 days, 0 hours, 47 minutes left". Trailing zeros stay: "1 day,
  // 0 hours" is worth saying, because the tiles show it.
  const firstSet = parts.findIndex((p) => p.value > 0);
  const shown = firstSet === -1 ? parts.slice(-1) : parts.slice(firstSet);
  return `${shown.map((p) => `${p.value} ${p.value === 1 ? p.singular : p.label.toLowerCase()}`).join(", ")} left`;
}

// --- Countdown maths ----------------------------------------------------------

interface Part {
  value: number;
  label: string;
  singular: string;
}

const DEFAULT_UNITS: CountdownUnit[] = ["days", "hours", "minutes"];

function countdownParts(spec: CountdownSpec, now: number): Part[] | null {
  const remaining = spec.deadline - now;
  if (!(remaining > 0)) return null;

  const units = spec.units?.length ? spec.units : DEFAULT_UNITS;
  const totalMinutes = Math.floor(remaining / 60_000);
  const out: Part[] = [];
  let rest = totalMinutes;

  // Each unit takes its whole share only if a coarser unit isn't shown; the
  // largest unit shown absorbs everything above it.
  if (units.includes("days")) {
    out.push({ value: Math.floor(rest / 1440), label: "DAYS", singular: "day" });
    rest %= 1440;
  }
  if (units.includes("hours")) {
    out.push({ value: Math.floor(rest / 60), label: "HOURS", singular: "hour" });
    rest %= 60;
  }
  if (units.includes("minutes")) {
    out.push({ value: rest, label: "MINUTES", singular: "minute" });
  }
  return out;
}

// --- Text ------------------------------------------------------------------

function drawText(s: Surface, text: string, x: number, y: number, scale: number, color: RGB, tracking = 1): void {
  let cx = x;
  for (const ch of text) {
    const rows = glyph(ch);
    if (rows) {
      for (let row = 0; row < GLYPH_H; row++) {
        for (let col = 0; col < GLYPH_W; col++) {
          if (rows[row][col] === "#") s.rect(cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cx += (GLYPH_W + tracking) * scale;
  }
}


// --- Seven-segment numerals -----------------------------------------------------
// Big digits are drawn as segments rather than scaled-up bitmap glyphs: at the
// sizes a countdown wants, a 5x7 glyph looks like a pixel font, while segments
// stay crisp at any size and read as a deliberate clock face.

const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd",
};

/**
 * Segment layout for a digit box (w x h) with stroke `t`:
 *
 *      aaa        `half` is the height each vertical pair spans. Horizontals
 *     f   b       are inset from the sides so the corners read as mitred
 *      ggg        joins rather than a solid block; verticals run slightly
 *     e   c       long into the horizontals, which the downsample blends.
 *      ddd
 */
function drawSegmentDigit(s: Surface, d: string, x: number, y: number, w: number, h: number, t: number, color: RGB): void {
  const on = SEGMENTS[d] ?? "";
  const half = (h - t) / 2;
  const inset = t * 0.6;
  const draw = (seg: string, rx: number, ry: number, rw: number, rh: number) => {
    if (on.includes(seg)) s.rect(x + rx, y + ry, rw, rh, color);
  };
  draw("a", inset, 0, w - 2 * inset, t);
  draw("f", 0, inset, t, half - inset);
  draw("b", w - t, inset, t, half - inset);
  draw("g", inset, half, w - 2 * inset, t);
  draw("e", 0, half + t, t, half - inset);
  draw("c", w - t, half + t, t, half - inset);
  draw("d", inset, h - t, w - 2 * inset, t);
}

/**
 * The tile is sized for two digits and tolerates three. Anything wider spills
 * outside the card — which a far-future deadline really does produce (a year
 * typo'd as 3000 is ~355,000 days, six digits). MAX_HORIZON_DAYS at the signing
 * endpoint is the real guard; this clamp is the backstop that keeps a valid
 * signature from ever drawing outside its tile.
 */
const MAX_DIGITS_VALUE = 999;

function digitsOf(value: number): string {
  return String(Math.min(Math.max(0, Math.floor(value)), MAX_DIGITS_VALUE)).padStart(2, "0");
}

function drawNumber(s: Surface, value: number, x: number, y: number, dw: number, dh: number, t: number, gap: number, color: RGB): number {
  let cx = x;
  for (const ch of digitsOf(value)) {
    drawSegmentDigit(s, ch, cx, y, dw, dh, t, color);
    cx += dw + gap;
  }
  return cx - gap - x;
}

function numberWidth(value: number, dw: number, gap: number): number {
  const len = digitsOf(value).length;
  return len * dw + (len - 1) * gap;
}

// --- Renderer --------------------------------------------------------------------

/** Supersample factor — everything is drawn at Nx and box-reduced on the way out. */
const SS = 3;

export const LIVE_IMAGE_WIDTH = 600;
export const LIVE_IMAGE_HEIGHT = 150;

/** Render the spec as it stands at `now`. Returns PNG bytes. */
export function renderLiveImage(spec: LiveImageSpec, now = Date.now()): Buffer {
  const bg = rgb(spec.bg ?? "#f4f4f7");
  const tile = rgb(spec.tile ?? "#ffffff");
  const accent = rgb(spec.accent ?? "#4f46e5");
  const label = rgb(spec.label ?? "#6b7280");

  const W = LIVE_IMAGE_WIDTH * SS;
  const H = LIVE_IMAGE_HEIGHT * SS;
  const s = new Surface(W, H, bg);

  const parts = countdownParts(spec, now);

  if (!parts) {
    const text = (spec.expiredLabel ?? "This offer has ended").slice(0, 40);
    const scale = 3 * SS;
    const w = textWidth(text, scale);
    drawText(s, text, (W - w) / 2, (H - GLYPH_H * scale) / 2, scale, accent);
    return s.downsample(SS).toPng();
  }

  // Tile geometry, in supersampled units.
  const tileW = 150 * SS;
  const tileH = 110 * SS;
  const gap = 14 * SS;
  const totalW = parts.length * tileW + (parts.length - 1) * gap;
  let tx = (W - totalW) / 2;
  const ty = (H - tileH) / 2;

  const digitH = 52 * SS;
  const digitW = 30 * SS;
  const thickness = 7 * SS;
  const digitGap = 7 * SS;
  const labelScale = 2 * SS;

  for (const part of parts) {
    s.roundRect(tx, ty, tileW, tileH, 10 * SS, tile);

    const nw = numberWidth(part.value, digitW, digitGap);
    drawNumber(s, part.value, tx + (tileW - nw) / 2, ty + 18 * SS, digitW, digitH, thickness, digitGap, accent);

    const lw = textWidth(part.label, labelScale);
    drawText(s, part.label, tx + (tileW - lw) / 2, ty + tileH - 24 * SS, labelScale, label);

    tx += tileW + gap;
  }

  return s.downsample(SS).toPng();
}
