const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export interface BetaStatus {
  closed: boolean;
  seatsTotal: number;
  seatsLeft: number;
  accepting: boolean;
}

/**
 * How the beta is doing, for the visitor's benefit.
 *
 * A stranger landing on rootmail.io sees a Sign up button and reasonably
 * expects to sign up. They cannot, and finding that out at the end of a form is
 * the worst way to learn it — so every surface that offers a way in asks this
 * first and tells them the truth before they invest anything.
 *
 * Falls back to "closed and full" when the API cannot be reached: over-promising
 * an open door is the more damaging error, since it ends in a refusal either way.
 */
export async function betaStatus(): Promise<BetaStatus> {
  try {
    const res = await fetch(`${API_URL}/v1/beta/status`, {
      // Seats change as people join; a minute of staleness is invisible to a
      // visitor and saves hammering the API on every page view.
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const d = (await res.json()) as {
      closed?: boolean;
      seats_total?: number;
      seats_left?: number;
      accepting?: boolean;
    };
    return {
      closed: d.closed ?? true,
      seatsTotal: d.seats_total ?? 0,
      seatsLeft: d.seats_left ?? 0,
      accepting: d.accepting ?? false,
    };
  } catch {
    return { closed: true, seatsTotal: 0, seatsLeft: 0, accepting: false };
  }
}
