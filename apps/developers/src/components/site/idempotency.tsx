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
 * renders both responses. Same id. Different status code. A response header
 * saying which one this was. Roughly one-seventh the latency.
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
 * WHAT THE OWNER SAID, AND WHAT CHANGED (2026-08-31)
 *
 *   "the information there is very small and is good, but the engagement can be
 *    improved. I see where it said 'send it twice'. We can totally improve the
 *    placement of buttons, the font type, font size, the arrangement — that
 *    particular section can be made a lot better."
 *
 * It was: a 12.5px mono button, a 63-character mono disclosure crowding it on
 * the same line, and two unrelated response panels below. Three fixes, in the
 * order of the complaint.
 *
 * 1. **THE ARRANGEMENT IS NOW THE SENTENCE.** The section is one artifact
 *    instead of three boxes, and it is built like the claim reads: the KEY
 *    enters once at the top, the two requests are the middle, and ONE MESSAGE
 *    leaves once at the bottom. A merge bracket drawn in four hairlines
 *    (`.merge` in `globals.css`) joins the two columns into the single id.
 *    "The same key twice sends once" is now something the layout does rather
 *    than something a caption asserts — which is also why the caption is gone.
 *
 * 2. **THE BUTTON IS ON THE KEY IT SENDS.** It sits in the head, beside the
 *    `Idempotency-Key` it is about to reuse, instead of floating above the
 *    panels with no stated relationship to either. Pressing it mints a new key
 *    and the head shows THAT key — so the value on screen is the value that
 *    produced the two responses under it, which is the whole point of the
 *    section applied to its own chrome.
 *
 * 3. **FONT AND SIZE.** The label is the UI sans at 15px on a 44px control
 *    (see `controls.tsx`), not 12.5px of JetBrains Mono. The disclosure moved
 *    out of the button's row to a sourcing line under the artifact, where it
 *    is still on screen and no longer competing with the thing to press.
 *
 * RESTING STATE. Both panels render server-side from a cached run, labelled.
 * Pressing the button replaces them with live ones. Nothing here waits on a
 * click and nothing is revealed by motion (Law 1); with JavaScript disabled
 * the artifact is exactly as informative, minus the ability to re-run it.
 * The merge bracket and the foot are CSS and markup, never animation.
 */

/** The key the cached pair was recorded under. Replaced by a live one on click. */
const CACHED_KEY = "demo-8f21c4";

export function Idempotency() {
  const [first, setFirst] = useState<DemoRun>(CACHED_SEND);
  const [second, setSecond] = useState<DemoRun>(CACHED_REPLAY);
  const [key, setKey] = useState(CACHED_KEY);
  const [pending, setPending] = useState(false);

  const sendTwice = async () => {
    setPending(true);
    const next = `demo-${Math.random().toString(16).slice(2, 10)}`;
    setKey(next);
    const call = async () => {
      const res = await fetch("/api/demo/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: next }),
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
      setKey(CACHED_KEY);
      setFirst({ ...CACHED_SEND, note: "cached example — this browser could not reach the demo" });
      setSecond({ ...CACHED_REPLAY, note: "cached example" });
    } finally {
      setPending(false);
    }
  };

  // Never asserted, always compared. If the demo ever came back with two
  // different ids the foot has to say so — a hardcoded "one message" would be
  // this page telling the exact species of lie it exists to argue against.
  const merged = first.body.id === second.body.id;

  return (
    <div>
      <div className="artifact">
        {/* THE KEY, ONCE — and the control that reuses it, next to it. */}
        <div className="artifact-head">
          <span className="flex min-w-0 items-baseline gap-2.5">
            <span className="shrink-0 text-[13px] text-ink-muted">Idempotency-Key</span>
            <span className="min-w-0 truncate font-mono text-[13.5px] text-foreground" data-fact>
              {key}
            </span>
          </span>
          <RunButton size="md" onClick={sendTwice} disabled={pending} className="-my-1">
            {pending ? "Sending…" : "Send it twice"}
          </RunButton>
        </div>

        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Response run={first} request="request 1" compact />
            <Response run={second} request="request 2" compact />
          </div>

          {/* The merge. Two risers over the column centres, a beam, a stem —
              four hairlines of CSS, present at every motion setting and with
              JavaScript off. Hidden below `md`, where the two responses stop
              being columns and the bracket would be drawing a relationship the
              layout no longer has. */}
          <div className="merge hidden md:block" aria-hidden="true">
            <span className="merge-riser" style={{ left: "25%" }} />
            <span className="merge-riser" style={{ left: "75%" }} />
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-rule pt-3 md:mt-0 md:justify-center md:border-t-0 md:pt-0">
            <span className="text-[13px] text-ink-muted">
              {merged ? "one message" : "two messages"}
            </span>
            <span className="min-w-0 break-all font-mono text-[13.5px] text-foreground" data-fact>
              {merged ? first.body.id : `${first.body.id} · ${second.body.id}`}
            </span>
          </div>
        </div>
      </div>

      {/* The same disclosure D1 carries, moved off the button's row. Every
          panel on this site that could be mistaken for a live feed says which
          one it is — for a product whose thesis is that it draws the difference
          between what it witnessed and what it guessed, labelling our own demo
          IS the argument. */}
      <p className="mt-3 font-mono text-[12.5px] text-ink-muted" data-fact>
        {DEMO_DISCLOSURE}
      </p>
    </div>
  );
}
