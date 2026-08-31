"use client";

import { useState } from "react";
import { Response } from "./call-response";
import { RunButton } from "./controls";
import { CACHED_REPLAY, CACHED_SEND, DEMO_DISCLOSURE, type DemoRun } from "@/lib/demo";

/**
 * D3 — IDEMPOTENCY, DEMONSTRATED IN ONE CLICK.
 * `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * One button fires two real requests carrying an identical idempotency key and
 * renders both responses side by side. Same id. Different status code. A
 * response header saying which one this was. Roughly one-seventh the latency.
 * That is the entire section — no prose can do what two responses with the same
 * id in them do, and this is the single most-doubted claim in the category.
 *
 * THE SHAPE IS CHECKED AGAINST THE CODE, NOT AGAINST THE SPEC.
 * `apps/api/src/routes/messages.ts:243-257` is the replay path: it sets the
 * response header `Idempotent-Replayed: true` and returns `200` with the
 * identical serialized message. There is **no** `deduplicated` body field, so
 * the panel does not print one — and a header is where a developer expects to
 * be told this was a replay, so rendering the real thing is also the more
 * credible artifact. The first response is `202 Accepted`, not `201 Created`:
 * the send is accepted and enqueued, and the route ends `reply.status(202)`.
 *
 * RESTING STATE. Both panels render server-side from a cached run, labelled.
 * Pressing the button replaces them with live ones. Nothing here waits on a
 * click and nothing is revealed by motion (Law 1); with JavaScript disabled
 * the artifact is exactly as informative, minus the ability to re-run it.
 */
export function Idempotency() {
  const [first, setFirst] = useState<DemoRun>(CACHED_SEND);
  const [second, setSecond] = useState<DemoRun>(CACHED_REPLAY);
  const [pending, setPending] = useState(false);

  const sendTwice = async () => {
    setPending(true);
    const key = `demo-${Math.random().toString(16).slice(2, 10)}`;
    const call = async () => {
      const res = await fetch("/api/demo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      return (await res.json()) as DemoRun;
    };
    try {
      // Sequential on purpose: fired in parallel these race, and the loser
      // takes the `onConflictDoNothing` path rather than the replay path. Both
      // are correct behaviour, but only one of them is the thing being shown.
      setFirst(await call());
      setSecond(await call());
    } catch {
      setFirst({ ...CACHED_SEND, note: "cached example — this browser could not reach the demo" });
      setSecond({ ...CACHED_REPLAY, note: "cached example" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <RunButton onClick={sendTwice} disabled={pending}>
          {pending ? "sending…" : "Send it twice"}
        </RunButton>
        {/* The same disclosure D1 carries. Every panel on this site that could
            be mistaken for a live feed says which one it is — for a product
            whose thesis is that it draws the difference between what it
            witnessed and what it guessed, labelling our own demo IS the
            argument. */}
        <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
          {DEMO_DISCLOSURE}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Response run={first} request="request 1" compact />
        <Response run={second} request="request 2" compact />
      </div>

      {/* The sentence that used to close this section — "same id, different
          status code, and a header naming the replay" — is gone. D3's head row
          now says "watch the id, the status and the header", which is the same
          instruction delivered BEFORE the reader looks instead of after, and
          two of them is one too many. */}
    </div>
  );
}
