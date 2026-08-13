"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.rootmail.io";

/**
 * The live seat count, fetched after the page loads.
 *
 * The marketing site is statically generated, so anything rendered on the
 * server is fixed at build time — which is exactly how the count got frozen
 * before: a Suspense boundary in the root layout had its fallback prerendered
 * and nothing ever replaced it. Making the whole site dynamic to print one
 * number is a bad trade.
 *
 * So the server renders the honest sentence with no number, and this fills in
 * the count once it arrives. If the request fails, nothing appears — the strip
 * still says the true and useful thing, which is the point.
 */
export function BetaSeats() {
  const [seats, setSeats] = useState<{ left: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/v1/beta/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || typeof d.seats_left !== "number") return;
        setSeats({ left: d.seats_left, total: d.seats_total ?? 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!seats || seats.total < 1) return null;
  if (seats.left < 1) {
    return <span className="text-foreground">This round is full — join the list for the next one.</span>;
  }
  return (
    <span className="text-foreground">
      {seats.left} {seats.left === 1 ? "place" : "places"} left in this round.
    </span>
  );
}
