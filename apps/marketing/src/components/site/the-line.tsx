import { Line, type Station } from "@rootmail/design";
import { DeckScroll } from "./deck-scroll";

/**
 * "WHAT DOES IT DO FOR ME?" — section two, and the first place a stranger is
 * told, in nouns, what they get.
 *
 * ── WHAT CHANGED (2026-08-31, the story pass) ───────────────────────────────
 * This section used to be headed *"One record, seen from three sides"* and it
 * ran an axis of Send / Converse / Prove crossed with an axis of
 * point-and-click / code — six half-panels, all on screen. The owner, reading
 * the finished page as a stranger:
 *
 *   *"nobody at this junction would care about that. There's no need for point
 *   and click and code. Just show what you're trying to show. Be assertive,
 *   tell somebody what you're trying to show him."* And: *"I don't know why
 *   I'm still seeing this arrow/line thing — it doesn't make sense in this
 *   context."*
 *
 * Three fixes, and the first two are removals:
 *
 * 1. **The code door is gone.** The parity claim (the same action exists in a
 *    mouse and in a call) is real and it survives as ONE sentence at the foot
 *    of the section pointing at the developer site. It was never worth half of
 *    every panel on the page's explaining section.
 * 2. **The line in the sequence panel is gone.** A two-station line labelled
 *    `step 2 → step 3 (stopped)` is only legible to somebody who already knows
 *    what a sequence is, which is nobody at section two. The same fact is now
 *    a sentence: she replied, so the follow-up cancelled itself.
 * 3. **The one line that stays is legended.** The send panel's line is the
 *    product, so it keeps its five stations — and gains one plain sentence
 *    saying what filled and hollow mean. That is comprehension, not the
 *    epistemology argument; the argument itself is section seven's job and is
 *    deliberately not made here.
 *
 * The three sides are now three plain jobs — send it, read what comes back,
 * look it up later — and the three panels are three moments of ONE email:
 * the morning it went out, the moment Ana wrote back, and the day somebody
 * asked for proof. The shared id is still printed, and it still does the
 * arguing, but no sentence depends on the reader noticing it.
 *
 * ── THE LAWS THAT STILL BIND ────────────────────────────────────────────────
 * 1. **All three panels are in the DOM at first paint, and all three claims are
 *    prose that is never hidden.** The rail on the left states what each side
 *    is, at rest, always — so the section's argument is complete with no script
 *    and no scrolling. The rail items are `<label>`s for real radio inputs, so
 *    with JavaScript deleted this is a keyboard-operable tab set sitting on its
 *    first panel. The scroll rig only ever advances a scene that is already
 *    finished; it never creates or removes content.
 * 2. `prefers-reduced-motion` turns the pin off entirely (see `.line-rig` in
 *    `globals.css`). Every panel is one click away and it moves under nobody.
 * 3. `Opened` is hollow here exactly as it is in production, and `Clicked` has
 *    no timestamp so it draws dashed. The honest gap is in the first panel.
 *
 * The CSS keys (`data-side-panel="send" | "conv" | "prove"`, `#side-N`) are
 * load-bearing and unchanged — `globals.css` reaches forward from them.
 */

const ID = "msg_01J9Q7F2XKB4M0RVTC8H";
const TO = "ana@sunsetvillas.com";

const sendStations: Station[] = [
  { label: "Queued", state: "witnessed", at: "09:14:02" },
  { label: "Sent", state: "witnessed", at: "09:14:03" },
  { label: "Delivered", state: "witnessed", at: "09:14:07" },
  { label: "Opened", state: "inferred", at: "09:41:55" },
  { label: "Clicked", state: "unknown", at: "—" },
];

/** The three sides, in scroll order. `say` is never hidden — see law 1. */
const SIDES = [
  {
    key: "send",
    name: "Send it",
    say: "Order confirmations, password resets, newsletters, launch announcements — written once and sent from your own address.",
  },
  {
    key: "conv",
    name: "Read what comes back",
    say: "Replies land in one inbox your whole team can see, not a no-reply void — and an automatic follow-up stops the moment somebody writes back.",
  },
  {
    key: "prove",
    name: "Look it up later",
    say: "Weeks on, find any message, see every step it took, and export a sealed record you can hand to somebody who does not trust you.",
  },
] as const;

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 py-2">
      <span className="w-28 shrink-0 text-[12.5px] text-ink-muted">{k}</span>
      <span className={`min-w-0 break-words font-mono text-[12px] ${tone ?? ""}`} data-fact>
        {v}
      </span>
    </div>
  );
}

/** The sentence under a panel that says, in words, what the panel means. */
function Says({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-muted">{children}</p>
  );
}

export function TheLine() {
  return (
    <section id="platform" className="line-rig slab lit lit-edge">
      <div id="line-pin" className="line-pin">
        <div className="container py-14 md:py-20">
          <div className="tri grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
            {/* The three radios are direct children of `.tri` and come first,
                because every rule in globals.css reaches forward from
                `#side-N:checked` with `~`. Absolutely positioned, so they take
                no grid track. */}
            {SIDES.map((s, i) => (
              <input
                key={s.key}
                type="radio"
                name="tri-side"
                id={`side-${i}`}
                defaultChecked={i === 0}
                className="tri-radio"
              />
            ))}

            <div>
              <h2 className="display-m text-balance">
                Everything your email needs to just work.
              </h2>
              <p className="lead mt-5 max-w-md text-ink-muted">
                One editor, one contact list, one address of your own. Below is a single email at
                three moments: the morning it went out, the minute she wrote back, and the day
                somebody asked us to prove it.
              </p>

              {/* The rail. All three claims are prose at rest; the mark moves,
                  the words do not appear. */}
              <ol className="tri-rail mt-8">
                {SIDES.map((s, i) => (
                  <li key={s.key}>
                    <label
                      htmlFor={`side-${i}`}
                      data-side={i}
                      className="tri-item flex cursor-pointer gap-4 py-3.5"
                    >
                      <span aria-hidden="true" className="tri-node mt-[0.45rem] shrink-0" />
                      <span className="min-w-0">
                        <span className="tri-name block text-[15px] font-semibold">{s.name}</span>
                        <span className="tri-say mt-1 block max-w-sm text-[13px] leading-snug text-ink-muted">
                          {s.say}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ol>

              {/* The parity claim, kept as one sentence instead of half of
                  every panel. See the file note. */}
              <p className="mt-8 max-w-sm text-[13px] leading-relaxed text-ink-muted">
                Everything here is also one API call.{" "}
                <a
                  href="https://developers.rootmail.io"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  If you have developers, they get the same product
                </a>
                .
              </p>
            </div>

            <figure className="tri-stage min-w-0 rounded-2xl bg-well p-2 shadow-well sm:p-3">
              {/* The identity. One id, printed once, true of all three panels. */}
              <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pb-3 pt-2">
                <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                  {ID}
                </span>
                <span className="text-[12.5px] text-ink-muted">
                  one email, at three moments — the same record every time
                </span>
              </figcaption>

              {/* One lifted card out of the tray, holding whichever side is
                  current. The panel height is locked to the tallest of the
                  three so nothing below it moves when the beat changes. */}
              <div
                className="rounded-xl bg-card p-4 shadow-e2 sm:p-5"
                style={{ "--background": "var(--card)" } as React.CSSProperties}
              >
                <div className="tri-panels min-h-[26rem] lg:min-h-[21rem]">
                  <div data-side-panel="send">
                    <p className="text-[13px] font-medium">
                      Tuesday, 09:14 — a customer books a room, and your site asks rootmail to send
                      the confirmation.
                    </p>
                    <div className="ruled mt-4">
                      <Row k="to" v={TO} />
                      <Row k="subject" v="Your booking is confirmed" />
                      <Row k="template" v="booking-confirmed" />
                    </div>
                    <div className="mt-5 overflow-x-auto pb-2">
                      <Line
                        stations={sendStations}
                        scale="page"
                        label="Queued, sent, delivered, opened; clicked unknown"
                      />
                    </div>
                    <Says>
                      Filled means the mail provider told us it happened. Hollow means we are
                      guessing — an &ldquo;open&rdquo; is a tracking image loading, and a mail app
                      can load it with nobody in the room. Nothing was recorded for a click, so
                      that one is left blank rather than counted as a no.
                    </Says>
                  </div>

                  <div data-side-panel="conv">
                    <p className="text-[13px] font-medium">
                      11:47 — she writes back. It is a conversation now, not a send.
                    </p>
                    <div className="ruled mt-4">
                      <Row k="09:14 · out" v="Your booking is confirmed" />
                      <Row k="11:47 · in" v="Can we get a late checkout?" />
                    </div>
                    <p className="mt-4 font-mono text-[12.5px] text-stopped" data-fact>
                      follow-up cancelled 11:47 · contact replied
                    </p>
                    <Says>
                      Her reply arrives in the shared inbox with the original underneath it, so
                      whoever is on duty can answer without asking who sent what. And the
                      follow-up email that was queued for her tomorrow morning cancelled itself
                      the second she replied — nobody has to remember to stop it.
                    </Says>
                  </div>

                  <div data-side-panel="prove">
                    <p className="text-[13px] font-medium">
                      Three weeks later — a customer says the confirmation never arrived.
                    </p>
                    <div className="ruled mt-4">
                      <Row k="recipient" v={TO} />
                      <Row k="subject" v="Your booking is confirmed" />
                      <Row k="sent" v="09:14:03 · delivered 09:14:07" />
                      <Row k="content hash" v="sha256:9f2c41ab…7d0e" />
                      <Row k="signature" v="ed25519:4b81…c2af" />
                    </div>
                    {/* `<details>` because the check must work with no script:
                        the summary IS the button and the result is its
                        content. */}
                    <details className="mt-5">
                      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-rule px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
                        Check the seal
                      </summary>
                      <p className="mt-3 font-mono text-[12px] text-witnessed" data-fact>
                        signature valid (Ed25519) · content hash matches
                      </p>
                    </details>
                    <Says>
                      This is the receipt for the receipt: what went out, to whom, at what second,
                      sealed at the moment of sending so nobody — including us — can edit it
                      afterwards. Download it and their lawyer, their auditor or their bank can
                      check the seal themselves, without taking our word for anything.
                    </Says>
                  </div>
                </div>
              </div>
            </figure>

            {/* The rig. It only ever sets `checked` on a radio that already has
                a complete panel behind it. */}
            <DeckScroll count={SIDES.length} rig=".line-rig" pin="#line-pin" prefix="side" />
          </div>
        </div>
      </div>
    </section>
  );
}
