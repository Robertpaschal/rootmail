import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  encodePng,
  Errors,
  glyph,
  LIVE_IMAGE_HEIGHT,
  LIVE_IMAGE_WIDTH,
  liveImageAlt,
  liveImageUrl,
  MAX_HORIZON_DAYS,
  renderLiveImage,
  rgb,
  verifyLiveImageToken,
} from "@rootmail/core";
import { parse } from "../lib/validate";

// PUBLIC. Renders a live-at-open image for an <img> inside a sent email — the
// only way to put content in an email that is current at fetch time, since no
// mail client runs JavaScript. The spec travels in an HMAC-signed token, so this
// is not an open image-rendering endpoint: an unsigned or edited token renders
// nothing. See packages/core/src/live-image.ts for what "live" honestly means
// here (Apple pre-fetches, Gmail proxies and caches, Outlook blocks entirely).

/**
 * What we serve when we can't draw the real thing — a bad token, or the
 * per-minute render budget below being spent.
 *
 * A broken <img> in a customer's email is worse than a quiet one: the recipient
 * would see a torn-image icon mid-layout, which reads as "this company sends
 * broken email". The status code still says 400 for anyone debugging.
 *
 * It is FULL SIZE, not the 1x1 pixel you'd reach for by reflex. The block that
 * carries this image renders as
 *   <img width="600" style="width:100%;height:auto">
 * so the client derives the height from the source's aspect ratio — and a 1x1
 * source is 1:1, which paints a 600x600 white SQUARE in the middle of the
 * email. Matching the real image's dimensions keeps the layout intact and the
 * failure invisible. Built once at module load, so serving it is a memcpy.
 */
const FALLBACK = encodePng(
  LIVE_IMAGE_WIDTH,
  LIVE_IMAGE_HEIGHT,
  ((): Uint8Array => {
    const [r, g, b] = rgb("#f4f4f7"); // the default card background
    const px = new Uint8Array(LIVE_IMAGE_WIDTH * LIVE_IMAGE_HEIGHT * 3);
    for (let i = 0; i < px.length; i += 3) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
    return px;
  })(),
);

/**
 * Per-minute render cache. THIS IS LOAD-BEARING, not an optimisation.
 *
 * Drawing one image is ~12ms of SYNCHRONOUS CPU (supersampled raster +
 * downsample; the deflate is a rounding error), and Node serves this on the one
 * event loop that also runs sends, webhooks and the dashboard's API calls. The
 * URL is unauthenticated by necessity and printed in every copy of a campaign,
 * so it is public knowledge. Measured: the endpoint tops out around 74 req/s no
 * matter the concurrency, and a burst against it pushes /health from 48ms to
 * 800ms — i.e. a handful of IPs inside the ordinary 300/min limit can stall the
 * whole API. Without this cache that is a denial-of-service hole, not a slow route.
 *
 * Caching to the minute is free of consequence because the image has no seconds
 * field (see live-image.ts) — nothing it draws changes more than once a minute,
 * so a cached copy is pixel-identical to a fresh render within its bucket.
 *
 * Keyed by the token AFTER it verifies, so an attacker can't grow the map with
 * junk. Cleared whenever the minute rolls, which also bounds it in time.
 *
 * CACHE_MAX IS A CPU BUDGET, NOT A MEMORY CAP. It is the number of rasters we
 * are willing to spend in any one minute, and once it is gone we serve FALLBACK
 * rather than drawing — because the alternative ("stop caching, keep rendering")
 * is precisely the denial-of-service hole this exists to close: past the cap,
 * every request for a fresh token would raster again, unbounded, at whatever
 * rate the callers manage. Measured cost is 6ms per raster on a dev laptop and
 * ~12ms on the prod container, so 512 caps this route near 6s of CPU per minute
 * — about 10% of one core — no matter the request rate, the number of distinct
 * tokens, or the number of source IPs. That is the whole safety argument.
 *
 * Reaching the cap needs 512 DISTINCT live-image campaigns fetched in the same
 * minute (tokens can only be minted through the authenticated /v1/live/sign, so
 * a stranger cannot manufacture them). If the warn below ever fires in anger,
 * the fix is a render worker or a CDN in front, not a bigger number here.
 */
const CACHE_MAX = 512;
let cacheBucket = -1;
const cache = new Map<string, Buffer>();

/** The PNG for this token, or null when this minute's render budget is spent. */
function renderCached(token: string, spec: Parameters<typeof renderLiveImage>[0], now: number): Buffer | null {
  const bucket = Math.floor(now / 60_000);
  if (bucket !== cacheBucket) {
    cache.clear();
    cacheBucket = bucket;
  }
  const hit = cache.get(token);
  if (hit) return hit;
  if (cache.size >= CACHE_MAX) return null;
  const png = renderLiveImage(spec, now);
  cache.set(token, png);
  return png;
}

export async function liveImageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/live/image.png", async (req, reply) => {
    const { t } = req.query as { t?: string };
    const spec = t ? verifyLiveImageToken(t) : null;

    // WHY no-store AND NOT a short max-age.
    //
    // The tempting alternative is `max-age=60` — the image only changes once a
    // minute, so let the intermediaries absorb the load. We don't, for two
    // reasons. First, it buys nothing: the per-minute cache above already caps
    // our cost at ~10% of a core, so there is no load left to delegate, and
    // `max-age` would trade real freshness for a saving we've already banked.
    // Second, it is the one instruction we'd regret. Gmail's proxy re-fetches
    // between opens when told not to store; hand it an explicit 60s licence and
    // in practice it keeps the copy far longer than 60s, which freezes the exact
    // feature the endpoint exists for.
    //
    // These headers are correct but NOT sufficient, and no header can fix that:
    // Apple's Mail Privacy Protection has already pre-fetched the image minutes
    // after DELIVERY, so for those readers it is frozen before the mail is ever
    // opened. That is a property of the medium, not of our cache policy, and it
    // is why the copy around the image must never promise to-the-minute
    // accuracy and why the renderer refuses to draw seconds.
    reply
      .header("Content-Type", "image/png")
      .header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      .header("Pragma", "no-cache")
      .header("Expires", "0");

    if (!spec) return reply.code(400).send(FALLBACK);

    // DIAGNOSTIC ONLY — deliberately a log line and nothing else. Whether Gmail's
    // proxy re-fetches (making the countdown live) or serves its cached copy
    // (freezing it) is only answerable from a real inbox, and this is what makes
    // that test self-answering: send one email, open it twice, and count the
    // lines with a GoogleImageProxy user-agent.
    //
    // It must NOT become open tracking. Opens have one source of truth — the SES
    // notifications handled in lib/ses-events.ts, first-open-only into the audit
    // log. Nothing here writes to the database, and nothing here should.
    req.log.info(
      { ua: req.headers["user-agent"], deadline: new Date(spec.deadline).toISOString() },
      "live image fetched",
    );
    const png = renderCached(t as string, spec, Date.now());
    if (!png) {
      req.log.warn(
        { distinctTokens: cache.size },
        "live image render budget spent for this minute — serving the fallback",
      );
      return reply.send(FALLBACK);
    }
    return reply.send(png);
  });

  // AUTHENTICATED. Mints the signed image URL for the template studio. Signing
  // lives here, not in the dashboard, so LINK_SIGNING_SECRET never leaves the
  // API — the dashboard calls this server-side like every other endpoint.
  const signBody = z.object({
    deadline: z.string().datetime(),
    expired_label: z.string().max(40).optional(),
    bg: z.string().max(9).optional(),
    tile: z.string().max(9).optional(),
    accent: z.string().max(9).optional(),
    label: z.string().max(9).optional(),
    units: z.array(z.enum(["days", "hours", "minutes"])).min(1).max(3).optional(),
  });

  app.post("/v1/live/sign", async (req) => {
    const b = parse(signBody, req.body);
    const at = new Date(b.deadline).getTime();
    // Bound the horizon here, where a human can be told why. Past this the day
    // count stops fitting its tile, and the usual cause is a mistyped year.
    if (at - Date.now() > MAX_HORIZON_DAYS * 86_400_000) {
      throw Errors.validation(
        `A countdown can look ahead at most ${MAX_HORIZON_DAYS} days. Check the year on that date.`,
      );
    }
    // Same reasoning, for the same reason. The image is drawn from a bundled
    // bitmap font covering A-Z, 0-9 and a little punctuation; a character it
    // doesn't have is skipped, leaving a blank hole mid-word. Unchecked, that
    // surfaces as "SALE  S OVER" in fifty thousand delivered copies, with
    // nothing anywhere saying why. An accented or non-Latin expired label is the
    // ordinary way to hit it, so it has to fail while someone is still looking
    // at the field.
    const undrawable = [...new Set([...(b.expired_label ?? "")])].filter((c) => !glyph(c));
    if (undrawable.length) {
      throw Errors.validation(
        `The countdown can't draw ${undrawable.map((c) => `"${c}"`).join(", ")}. ` +
          `Its lettering covers A-Z, 0-9, spaces and . , : - ' ! % / only.`,
      );
    }
    const spec = {
      kind: "countdown" as const,
      deadline: new Date(b.deadline).getTime(),
      expiredLabel: b.expired_label,
      bg: b.bg,
      tile: b.tile,
      accent: b.accent,
      label: b.label,
      units: b.units,
    };
    return {
      url: liveImageUrl(spec),
      // A suggestion only. The studio stores a STATIC alt, because alt text is
      // baked into the template at save time and would otherwise still claim
      // "5 days left" a month later.
      alt_suggestion: liveImageAlt(spec),
    };
  });
}
