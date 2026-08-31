import { Fragment } from "react";
import { Line, type Station } from "@rootmail/design";
import { Reveal } from "./motion";

/**
 * "How does it work?" — `<OneMessage>`, `docs/design/04-EXPERIENCE.md` §5.3.
 *
 * What was here: three ruled rows of prose under a three-station line, plus, at
 * an earlier position on the page, a five-tab `ProductTour` carousel. Five tabs
 * of five different screens is a GALLERY — it says "we have a lot of screens."
 * Three views of ONE MESSAGE says "there is one record and it follows you,"
 * which is the only structural claim rootmail has that the category does not.
 *
 * So: two segmented controls over one panel. Six states, and **the message id
 * is identical in all six**, pinned in the panel header. That identity is the
 * argument; no sentence in this section has to make it.
 *
 *   Axis A — the layer:  Send · Converse · Prove
 *   Axis B — the door:   Point and click · Code
 *
 * Axis B is `00-PHILOSOPHY.md §6`'s "two front doors" DRAWN — the same action,
 * in a mouse and in a call — rather than asserted in the 75-word paragraph that
 * used to end `features.tsx`.
 *
 * THE THREE LAWS
 * 1. All six panels are in the DOM at first paint and the tabs are radio
 *    inputs, so with JavaScript disabled this is still a working tab set (see
 *    the `.om` block in `globals.css` for the mechanism and why it is CSS).
 *    Nothing is revealed by motion because nothing here moves: switching an
 *    axis is a `display` swap, and a frozen frame lands on a complete panel.
 * 2. `prefers-reduced-motion` is the complete experience here, not a degraded
 *    one — there is no transition at any setting.
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

const TABS = [
  { id: "om-l-send", name: "om-layer", text: "Send", first: false },
  { id: "om-l-conv", name: "om-layer", text: "Converse", first: false },
  { id: "om-l-prove", name: "om-layer", text: "Prove", first: false },
  { id: "om-d-ui", name: "om-door", text: "Point and click", first: true },
  { id: "om-d-api", name: "om-door", text: "Code", first: false },
] as const;

const CHECKED = new Set(["om-l-send", "om-d-ui"]);

const TAB_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-rule px-3 text-[13px] font-medium";

/** A block of a request or a response. Data, drawn as data. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink-muted">
      {children}
    </pre>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 py-2">
      <span className="w-28 shrink-0 text-[12.5px] text-ink-muted">{k}</span>
      <span className={`font-mono text-[12px] ${tone ?? ""}`} data-fact>
        {v}
      </span>
    </div>
  );
}

export function TheLine() {
  return (
    <section id="platform" className="slab settle lit lit-edge">
      <div className="container py-14 md:py-24">
        <Reveal inView className="max-w-2xl">
          <h2 className="display-m text-balance">One record, seen from three sides.</h2>
          <p className="lead mt-5 text-ink-muted">
            The thing you sent, the conversation it became and the proof it leaves are the same
            message.
          </p>
        </Reveal>

        <div className="om mt-10">
          {TABS.map((t) => (
            <Fragment key={t.id}>
              <input
                type="radio"
                id={t.id}
                name={t.name}
                defaultChecked={CHECKED.has(t.id)}
                className="sr-only"
              />
              <label
                htmlFor={t.id}
                className={`${TAB_CLASS} ${t.first ? "om-door-first" : ""}`}
              >
                {t.text}
              </label>
            </Fragment>
          ))}

          <div className="om-caps mt-2 min-h-[3.25rem] text-[0.9375rem] leading-relaxed text-ink-muted sm:min-h-[1.75rem]">
            <p data-cap="send">
              Receipts and campaigns, from your own address, through your provider or ours.
            </p>
            <p data-cap="conv">
              Replies come back threaded, and a sequence stops the moment somebody writes back.
            </p>
            <p data-cap="prove">
              A signed record of what went out, checkable by somebody who does not trust us.
            </p>
          </div>

          <figure className="om-body mt-5 rounded-lg bg-well shadow-well">
            {/* The identity. One id, printed once, true of all six panels. */}
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
              <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                {ID}
              </span>
              <span className="font-mono text-[12.5px] text-ink-muted" data-fact>
                same message · same id · either door
              </span>
            </figcaption>

            {/* The panel height is locked to the tallest of the six so nothing
                below it moves when an axis changes. */}
            <div className="min-h-[17rem] px-4 py-5 sm:min-h-[14rem]">
              <div data-panel="send-ui">
                <div className="ruled">
                  <Row k="to" v={TO} />
                  <Row k="subject" v="Your booking is confirmed" />
                  <Row k="template" v="booking-confirmed · header, details, footer" />
                </div>
                <div className="mt-6 overflow-x-auto pb-2">
                  <Line
                    stations={sendStations}
                    scale="page"
                    label="Queued, sent, delivered, opened; clicked unknown"
                  />
                </div>
              </div>

              <div data-panel="send-api">
                <Code>{`await mail.send({
  to: "${TO}",
  template: "booking-confirmed",
  idempotencyKey: "bk_88213",
});

201 { "id": "${ID}", "status": "queued" }`}</Code>
              </div>

              <div data-panel="conv-ui">
                <div className="ruled">
                  <Row k="09:14 · out" v="Your booking is confirmed" />
                  <Row k="11:47 · in" v="Can we get a late checkout?" />
                </div>
                <div className="mt-6 overflow-x-auto pb-2">
                  <Line
                    stations={sequenceStations}
                    scale="page"
                    label="Sequence step 3, stopped because the contact replied"
                  />
                </div>
                <p className="mt-3 font-mono text-[12.5px] text-stopped" data-fact>
                  stopped: contact replied 11:47
                </p>
              </div>

              <div data-panel="conv-api">
                <Code>{`await mail.threads.get("thr_01J9QB4K2MP7");

entries: [
  { direction: "outbound", at: "09:14:07" },
  { direction: "inbound",  at: "11:47:12" },
]
event: sequence_exited_on_reply · seq_welcome step 3`}</Code>
              </div>

              <div data-panel="prove-ui">
                <div className="ruled">
                  <Row k="recipient" v={TO} />
                  <Row k="subject" v="Your booking is confirmed" />
                  <Row k="content hash" v="sha256:9f2c41ab…7d0e" />
                  <Row k="signature" v="ed25519:4b81…c2af" />
                </div>
                {/* `<details>` because Verify must work with no script: the
                    summary IS the button and the result is its content. */}
                <details className="mt-5">
                  <summary className={`${TAB_CLASS} list-none [&::-webkit-details-marker]:hidden`}>
                    Verify
                  </summary>
                  <p className="mt-3 font-mono text-[12px] text-witnessed" data-fact>
                    signature valid (Ed25519) · content hash matches
                  </p>
                </details>
              </div>

              <div data-panel="prove-api">
                <Code>{`await mail.proof.get("${ID}");

{ "algo": "Ed25519",
  "content_sha256": "9f2c41ab…7d0e",
  "signature": "4b81…c2af" }

$ rootmail proof verify ${ID}
signature valid (Ed25519) · content hash matches`}</Code>
              </div>
            </div>

          </figure>
        </div>
      </div>
    </section>
  );
}
