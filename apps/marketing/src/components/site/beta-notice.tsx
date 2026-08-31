"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.rootmail.io";

/**
 * The strip that stops a stranger wasting their time.
 *
 * Without it the site offers a Sign up button that cannot work: the door needs
 * an invite code, and the visitor only finds out after filling in a form. That
 * is the kind of small dishonesty people remember, and it costs us the exact
 * person who was interested enough to try.
 *
 * ── Why this is a client component ──────────────────────────────────────────
 *
 * It lives in the root layout, and the marketing site is statically generated,
 * so anything fetched on the server here is fixed at BUILD time — in CI, where
 * the API is unreachable. Two earlier attempts died on that. First the count
 * froze at whatever the build produced. Then a Suspense boundary hid the
 * problem rather than solving it: Next prerenders the fallback into the HTML
 * but does not register the client components inside it, so the fetching
 * component shipped as dead code and never ran on a single page.
 *
 * Hence no server fetch and no boundary. The strip renders its honest sentence
 * immediately — which alone tells a visitor what they need — and the seat count
 * appears when it arrives. A failed request leaves the sentence standing rather
 * than an error or, worse, a wrong number.
 */
export function BetaNotice() {
  const [seats, setSeats] = useState<{ left: number; total: number } | null>(null);
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/v1/beta/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setClosed(d.closed !== false);
        if (typeof d.seats_left === "number") {
          setSeats({ left: d.seats_left, total: d.seats_total ?? 0 });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // The day the beta opens, this disappears on its own.
  if (!closed) return null;

  const full = seats !== null && seats.total > 0 && seats.left < 1;

  return (
    <div className="sticky top-0 z-[60] border-b border-primary/25 bg-primary/10 backdrop-blur supports-[backdrop-filter]:bg-primary/10">
      {/* The nav sticks BELOW this strip rather than under it. Declaring the
          height here means an open beta — where nothing renders — leaves the
          nav flush at the top, with no constant to remember to remove. */}
      <style>{":root{--beta-notice-h:37px}"}</style>
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-sm">
        {/* `text-brass-text`, not `text-primary`. The brass FILL is 2.05:1 on
            this ground at 12px/600 — measured — and `--brass-text` is the
            darker cut that exists for exactly this: 4.80:1. The fill value is
            for things you press, not for words you read. */}
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-brass-text">
          {full ? "Beta full" : "Closed beta"}
        </span>

        {full ? (
          <span className="text-muted-foreground">
            This round is full — new accounts are paused. Join the list and
            you&apos;ll hear the moment the next one opens.
          </span>
        ) : (
          <span className="text-muted-foreground">
            rootmail is invite-only while we finish it.{" "}
            {seats && seats.total > 0 ? (
              <span className="text-foreground">
                {seats.left} {seats.left === 1 ? "place" : "places"} left in this round.
              </span>
            ) : null}
          </span>
        )}

        <Link
          href="/beta"
          className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground underline underline-offset-4"
        >
          {full ? "Get on the list" : "Ask for an invite"}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
