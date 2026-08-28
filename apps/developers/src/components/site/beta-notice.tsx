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
    <div className="sticky top-0 z-[60] border-b border-primary/25 bg-primary/10 backdrop-blur supports-[backdrop-filter]:bg-primary/10">
      <style>{":root{--beta-notice-h:37px}"}</style>
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
          Closed beta
        </span>
        <span className="text-muted-foreground">
          The API below is complete and real, but rootmail is invite-only
          {cap !== null ? ` and every account is capped at ${cap} sends a day` : ""} while we finish
          it.
        </span>
        <a
          href={`${MARKETING_URL}/beta`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Ask for an invite
        </a>
      </div>
    </div>
  );
}
