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
 * Falls back to "closed, but still accepting" when the API cannot be reached.
 *
 * I first wrote this the other way — full on error, reasoning that promising an
 * open door was worse. That is backwards, and a blip during a deploy proved it:
 * the homepage announced "Beta full" while eight seats sat empty, actively
 * turning away the only people who came. Both branches end at the SAME form, so
 * inviting someone to ask when we are full costs nothing (they join the queue,
 * which is what "full" tells them to do anyway), while claiming full when we
 * are not costs us the tester.
 */
export async function betaStatus(): Promise<BetaStatus> {
  try {
    const res = await fetch(`${API_URL}/v1/beta/status`, {
      // NOT cached, and deliberately so. This sat in the root layout, which Next
      // renders at BUILD time in CI — where api.rootmail.io is unreachable — so
      // every page shipped with the fallback baked in and no amount of ISR ever
      // replaced it. The component is wrapped in Suspense, so this makes one
      // small dynamic hole rather than making the whole site dynamic.
      cache: "no-store",
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
    return { closed: true, seatsTotal: 0, seatsLeft: 0, accepting: true };
  }
}
