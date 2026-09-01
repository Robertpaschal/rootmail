"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.rootmail.io";
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://rootmail.io";

/**
 * The same honesty strip the marketing site carries, on the developer site.
 *
 * This site had no mention of the beta at all: a developer — or anyone else
 * assessing us, including our email provider — could read the whole API
 * reference and reasonably conclude rootmail is generally available with no
 * limits worth mentioning. It is invite-only, and every account is capped at a
 * handful of sends a day.
 *
 * Client component, no server fetch, for the reason documented on the marketing
 * copy of this: these sites are statically generated, so a server fetch here
 * freezes at BUILD time in CI where the API is unreachable. The honest sentence
 * renders immediately; the cap number fills in when it arrives, and a failed
 * request leaves the sentence standing rather than a wrong number.
 */
export function BetaNotice() {
  const [closed, setClosed] = useState(true);
  const [cap, setCap] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/v1/pricing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.beta) return;
        setClosed(d.beta.active !== false);
        if (typeof d.beta.daily_send_cap === "number") setCap(d.beta.daily_send_cap);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // The day the beta opens, this disappears on its own.
  if (!closed) return null;

  return (
    <div className="beta-strip sticky top-0 z-[60] backdrop-blur">
      <style>{":root{--beta-notice-h:37px}"}</style>
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm">
        {/* `text-brass-text`, not `text-primary` — the same correction the
            marketing strip already carries, which this copy never got. The
            brass FILL is the colour of things you press; as WORDS it measured
            2.00:1 here. `--brass-text` is the darker cut that exists for
            exactly this, and the badge sits on opaque `--secondary` so it
            never composites against the page scrolling underneath. */}
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brass-text">
          Closed beta
        </span>
        <span className="text-muted-foreground">
          The API below is complete and real, but rootmail is invite-only
          {cap !== null ? ` and every account is capped at ${cap} sends a day` : ""} while we finish
          it.
        </span>
        {/* `text-foreground`, not brass in any cut. This one sits DIRECTLY on
            the strip's glass with the page scrolling under it, so its ground
            moves: `text-primary` measured **1.17:1** over the inverted band,
            and even `--brass-text` only reaches 2.87 there. Ink holds at 4.67.
            The underline is what marks it as a link, which is what the
            marketing strip does too. */}
        <a
          href={`${MARKETING_URL}/beta`}
          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
        >
          Ask for an invite
        </a>
      </div>
    </div>
  );
}
