"use client";

import { useState } from "react";
import { CodeBlock } from "./code-block";
import { QuietButton, RunButton } from "./controls";
import { Panel, PanelHead } from "./panel";

/**
 * D5 — SIGN IT, VERIFY IT, THEN BREAK IT.
 * `docs/design/04-EXPERIENCE.md` §8.4.
 *
 * The one demo on this site that FAILS ON PURPOSE, which is why it is the most
 * convincing one: a bundle anybody can check, and a button that makes the check
 * come back false in front of you.
 *
 * FOUR THINGS THAT ARE REAL, AND ONE THE SPEC GOT WRONG
 *
 * 1. **The route.** `GET /v1/messages/:id/proof`
 *    (`apps/api/src/routes/messages.ts:783`), reached in the SDK as
 *    `mail.messages.proof(id)`. The spec sketched `mail.proof.get()` and
 *    `GET /v1/proof/:id`; neither exists, and a developer checks.
 * 2. **The bundle keys are verbatim** from that route: `message_id`,
 *    `content_hash`, `subject`, `to`, `from`, `status`, `workspace_id`,
 *    `created_at`, `audit[]`, `issued_at`, wrapped with `signature`,
 *    `public_key` and `algorithm` from `signProof()`.
 * 3. **The signature below is a genuine Ed25519 signature** over the
 *    canonicalized bundle, made with the dev signing key that ships in
 *    `packages/core/src/proof.ts` — so `valid: true` here is a true statement
 *    about a real key, not a string we typed. Production signs with its own
 *    `PROOF_SIGNING_KEY`; this is a demonstration and says so.
 * 4. **The verify step is a real public route.** `POST /v1/proof/verify`
 *    (`apps/api/src/routes/proof.ts`) takes `{bundle, signature}`, needs no
 *    auth at all — that is what "somebody who does not trust us can check it"
 *    means — and answers `{object, valid}`. Both responses printed here are
 *    that shape.
 *
 * WHAT THE SPEC ASKED FOR THAT WE DO NOT DRAW: a `content hash: MISMATCH` line.
 * Our verifier checks the SIGNATURE over the whole canonical bundle; it does not
 * recompute a hash of a body it was never given. Changing one byte of the
 * subject changes the canonical bytes, so the signature stops verifying — that
 * is the real mechanism and it is the one shown. Inventing a second check would
 * be the exact species of claim this page exists to argue against.
 *
 * CLAIMS GUARD: the words "tamper-evident" and "tamper" do not appear. Until a
 * hash chain exists we are limited to "signed, independently verifiable,
 * content hash included" — so the button says `Change one byte`.
 *
 * RESTING STATE: bundle rendered, pristine, with the cached `valid: true`
 * already on screen. Both buttons re-render content that is already visible.
 * Nothing animates at any motion setting.
 */

const CALL = `const proof = await mail.messages.proof(msg.id);

// Anyone can check it — no key, no account.
await fetch("https://api.rootmail.io/v1/proof/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(proof), // { bundle, signature }
});`;

const SUBJECT = "Your booking is confirmed";
/** One byte, at a place a reader can find: the final `d` becomes an `e`. */
const SUBJECT_BROKEN = "Your booking is confirmee";

const CONTENT_HASH = "7242947b3a9e5bebd1e9f0a78da5b94985f81068fe9a0ef9853165b78233bdf4";
const SIGNATURE = "h6WP3QMuEuC5eeoGT+wBt9kVoyIKhdK12FAPO2u9IYnlqrgFZ/okCa40nF+Nzv7/H3yzy4cI8UUx5YY1AIHmAQ==";

/**
 * The bundle, printed as JSON that would actually parse. An ellipsis standing
 * in for the audit array — `"audit": [ queued, sent, delivered ]` — is the kind
 * of shortcut a developer reads as "they typed this out", so the three entries
 * are rendered in the shape the route emits: `event`, `occurred_at`, `actor`.
 *
 * Each entry wraps onto two lines. On one line the longest of them is 91
 * monospace characters, which overflowed the panel at every viewport under
 * ~1500px and put a horizontal scrollbar across the bottom of the artifact this
 * section is entirely about. Wrapping is free — it is still the same JSON, and
 * a developer reading a bundle would rather have three more lines than a
 * scroll.
 */
function bundleLines(subject: string): string[] {
  return [
    `  "message_id": "msg_8haaujzmx7g3pv5kjlsoon5e",`,
    `  "content_hash": "${CONTENT_HASH.slice(0, 24)}…",`,
    `  "subject": "${subject}",`,
    `  "to": "guest@test.rootmail.dev",`,
    `  "from": "bookings@sunsetvillas.com",`,
    `  "status": "delivered",`,
    `  "workspace_id": "ws_7q2ktdmzr4x9c1n6vbhsyaef",`,
    `  "created_at": "2026-08-26T09:14:02.184Z",`,
    `  "audit": [`,
    `    { "event": "queued",`,
    `      "occurred_at": "2026-08-26T09:14:02.184Z", "actor": "api_key" },`,
    `    { "event": "sent",`,
    `      "occurred_at": "2026-08-26T09:14:03.902Z", "actor": "worker" },`,
    `    { "event": "delivered",`,
    `      "occurred_at": "2026-08-26T09:14:07.451Z", "actor": "provider" }`,
    `  ],`,
    `  "issued_at": "2026-08-26T09:52:41.006Z"`,
  ];
}

export function Proof() {
  const [broken, setBroken] = useState(false);
  const subject = broken ? SUBJECT_BROKEN : SUBJECT;

  return (
    // 5/7, not 1/1: the bundle on the right is the artifact a reader actually
    // reads, and at an even split its longest audit line — 88 monospace
    // characters — overflowed and put a horizontal scrollbar under it.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <div>
        <CodeBlock code={CALL} filename="proof.ts" />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RunButton onClick={() => setBroken(false)}>Verify</RunButton>
          <QuietButton onClick={() => setBroken(true)}>Change one byte</QuietButton>
        </div>

        <Panel className="mt-3">
          <PanelHead>
            <span>POST /v1/proof/verify</span>
            <span>no key required</span>
          </PanelHead>
          <pre className="overflow-x-auto px-3 py-3 text-[12.5px] leading-[1.65]">
            <code className="font-mono">
              {`{\n  "object": "proof_verification",\n  "valid": `}
              <span className={broken ? "text-stopped" : "text-witnessed"}>
                {broken ? "false" : "true"}
              </span>
              {`\n}`}
            </code>
          </pre>
          <div
            className="border-t border-rule px-3 py-2 font-mono text-[11px] text-ink-muted"
            data-fact
          >
            {broken
              ? "ed25519 · one byte changed in subject · signature no longer verifies"
              : "ed25519 · signature verifies · content_hash sha256 included"}
          </div>
        </Panel>
      </div>

      <Panel className="self-start">
        <PanelHead>
          <span>GET /v1/messages/:id/proof</span>
        </PanelHead>
        <pre className="overflow-x-auto px-3 py-3 text-[12.5px] leading-[1.65]">
          <code className="font-mono">
            {"{\n"}
            {bundleLines(subject).map((l) =>
              l.includes('"subject"') ? (
                <span key={l} className={broken ? "text-stopped" : undefined}>
                  {l}
                  {"\n"}
                </span>
              ) : (
                <span key={l}>
                  {l}
                  {"\n"}
                </span>
              ),
            )}
            {"}\n"}
          </code>
        </pre>
        <div className="border-t border-rule px-3 py-2 font-mono text-[11px] text-ink-muted" data-fact>
          signature {SIGNATURE.slice(0, 22)}… · ed25519
        </div>
      </Panel>
    </div>
  );
}
