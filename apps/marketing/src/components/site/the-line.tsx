import { Line, type Station } from "@rootmail/design";
import { DeckScroll } from "./deck-scroll";

/**
 * "How does it work?" — `<OneMessage>`, `docs/design/04-EXPERIENCE.md` §5.3.
 *
 * Three views of ONE MESSAGE says "there is one record and it follows you,"
 * which is the only structural claim rootmail has that the category does not.
 * The message id is identical in all three panels, pinned in the stage header.
 * That identity is the argument; no sentence in this section has to make it.
 *
 * ── WHAT CHANGED (2026-08-31), AND WHY ──────────────────────────────────────
 * What was here was two segmented controls over one panel — an axis of
 * Send / Converse / Prove crossed with an axis of Point-and-click / Code, six
 * states, both operated by clicking. The owner:
 *
 *   *"I would not be thinking that somebody would want the distinction between
 *   Send, Converse and Prove… Instead of having me click Converse or click
 *   Prove, as I scroll it kind of changes. The distinction is kind of not
 *   relevant here because we are trying to show them something."*
 *
 * Both halves of that are acted on, and they are two different fixes:
 *
 * 1. **The layer axis is no longer a control.** It is a scroll-driven
 *    progression on the same sticky rig the hero uses — `min-height` on the
 *    section, `position: sticky` on its child, and the surplus mapped to a
 *    beat by `deck-scroll.tsx`. The reader is shown the three sides; they are
 *    not asked to choose between them.
 *
 * 2. **The door axis is not a control either — both doors are drawn at once.**
 *    The point of `00-PHILOSOPHY.md §6` is that the same action exists in a
 *    mouse and in a call. A tab set made that a claim you had to verify by
 *    clicking; side by side, it is a thing you can see. Nothing was removed:
 *    every one of the six former states is on screen, three at a time.
 *
 * ── THE LAWS THAT STILL BIND ────────────────────────────────────────────────
 * 1. **All three panels and all six half-panels are in the DOM at first paint,
 *    and the three claims are prose that is never hidden.** The rail on the
 *    left states what Send, Converse and Prove each are, at rest, always — so
 *    the section's ARGUMENT is complete with no script and no scrolling. Only
 *    the illustration rotates, and the rail items are `<label>`s for real
 *    radio inputs, so with JavaScript deleted this is a keyboard-operable tab
 *    set sitting on its first panel. The scroll rig can only advance a scene
 *    that is already finished; it never creates or removes content.
 * 2. `prefers-reduced-motion` turns the pin off entirely (see `.line-rig` in
 *    `globals.css`). The section becomes an ordinary one, every panel one
 *    click away, and it moves under nobody who asked it not to.
 * 3. `Opened` is hollow in the Send panel exactly as it is in production, and
 *    the sequence's third step in the Converse panel is severed with the reason
 *    that severed it. The demonstration is labelled as one.
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

/** The sequence the reply stopped. Nothing is drawn past a severed station. */
const sequenceStations: Station[] = [
  { label: "step 2", state: "witnessed", at: "sent 08:00" },
  { label: "step 3", state: "stopped", reason: "contact replied 11:47" },
];

/** The three sides, in scroll order. `say` is never hidden — see law 1. */
const SIDES = [
  {
    key: "send",
    name: "Send",
    say: "Receipts and campaigns, from your own address, through your provider or ours.",
  },
  {
    key: "conv",
    name: "Converse",
    say: "Replies come back threaded, and a sequence stops the moment somebody writes back.",
  },
  {
    key: "prove",
    name: "Prove",
    say: "A signed record of what went out, checkable by somebody who does not trust us.",
  },
] as const;

/** A block of a request or a response. Data, drawn as data — and drawn as a
 *  QUOTATION, on the code ground, which is dark in both themes on purpose. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-code px-3.5 py-3 font-mono text-[12px] leading-relaxed text-code-fg ring-1 ring-code-ring">
      {children}
    </pre>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 py-2">
      <span className="w-24 shrink-0 text-[12.5px] text-ink-muted">{k}</span>
      <span className={`min-w-0 break-words font-mono text-[12px] ${tone ?? ""}`} data-fact>
        {v}
      </span>
    </div>
  );
}

/** One half-panel, with the door it belongs to named above it. */
function Door({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-muted" data-fact>
        {name}
      </p>
      <div className="mt-3">{children}</div>
    </div>
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
              <h2 className="display-m text-balance">One record, seen from three sides.</h2>
              <p className="lead mt-5 max-w-md text-ink-muted">
                The thing you sent, the conversation it became and the proof it leaves are the same
                message.
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
            </div>

            <figure className="tri-stage min-w-0 rounded-2xl bg-well p-2 shadow-well sm:p-3">
              {/* The identity. One id, printed once, true of all three panels. */}
              <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pb-3 pt-2">
                <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                  {ID}
                </span>
                <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                  same message · same id · either door
                </span>
              </figcaption>

              {/* One lifted card out of the tray, holding whichever side is
                  current. The panel height is locked to the tallest of the
                  three so nothing below it moves when the beat changes. */}
              <div
                className="rounded-xl bg-card p-4 shadow-e2 sm:p-5"
                style={{ "--background": "var(--card)" } as React.CSSProperties}
              >
                <div className="tri-panels min-h-[26rem] lg:min-h-[20rem]">
                  <div data-side-panel="send">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:gap-6">
                    <Door name="point and click">
                      <div className="ruled">
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
                    </Door>
                    <Door name="code">
                      <Code>{`await mail.send({
  to: "${TO}",
  template: "booking-confirmed",
  idempotencyKey: "bk_88213",
});

201 {
  "id": "${ID}",
  "status": "queued",
}`}</Code>
                    </Door>
                    </div>
                  </div>

                  <div data-side-panel="conv">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:gap-6">
                    <Door name="point and click">
                      <div className="ruled">
                        <Row k="09:14 · out" v="Your booking is confirmed" />
                        <Row k="11:47 · in" v="Can we get a late checkout?" />
                      </div>
                      <div className="mt-5 overflow-x-auto pb-2">
                        <Line
                          stations={sequenceStations}
                          scale="page"
                          label="Sequence step 3, stopped because the contact replied"
                        />
                      </div>
                      <p className="mt-3 font-mono text-[12.5px] text-stopped" data-fact>
                        stopped: contact replied 11:47
                      </p>
                    </Door>
                    <Door name="code">
                      <Code>{`await mail.threads.get(
  "thr_01J9QB4K2MP7",
);

entries: [
  { dir: "out", at: "09:14:07" },
  { dir: "in",  at: "11:47:12" },
]

event: sequence_exited_on_reply
       seq_welcome step 3`}</Code>
                    </Door>
                    </div>
                  </div>

                  <div data-side-panel="prove">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:gap-6">
                    <Door name="point and click">
                      <div className="ruled">
                        <Row k="recipient" v={TO} />
                        <Row k="subject" v="Your booking is confirmed" />
                        <Row k="content hash" v="sha256:9f2c41ab…7d0e" />
                        <Row k="signature" v="ed25519:4b81…c2af" />
                      </div>
                      {/* `<details>` because Verify must work with no script:
                          the summary IS the button and the result is its
                          content. */}
                      <details className="mt-5">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-rule px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
                          Verify
                        </summary>
                        <p className="mt-3 font-mono text-[12px] text-witnessed" data-fact>
                          signature valid (Ed25519) · content hash matches
                        </p>
                      </details>
                    </Door>
                    <Door name="code">
                      <Code>{`await mail.proof.get(
  "${ID}",
);

{ "algo": "Ed25519",
  "content_sha256":
    "9f2c41ab…7d0e",
  "signature": "4b81…c2af" }

$ rootmail proof verify $ID
signature valid (Ed25519)
content hash matches`}</Code>
                    </Door>
                    </div>
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
