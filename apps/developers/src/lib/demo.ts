/**
 * THE DEMO CONTRACT — shared by the proxy route and the three panels that call it.
 *
 * `docs/design/04-EXPERIENCE.md` §8.3: the demos hit the REAL API through a
 * server-side sandbox key, and when they cannot, they SAY SO on screen rather
 * than quietly printing a convincing lie. A demo that fakes it when it fails is
 * the exact failure this company exists to argue against, so the fallback is
 * labelled in the panel, in mono, with the time it happened.
 *
 * Everything here is safe to import from a client component: it is types and
 * cached example values, no key material and no server-only imports.
 */

/** One request/response pair as the panels render it. */
export interface DemoRun {
  /** Did this come off the wire, or is it the cached example? */
  live: boolean;
  status: number;
  statusText: string;
  /** Round-trip time in ms, printed in mono beside the status. */
  ms: number;
  /** The real `Idempotent-Replayed: true` response header, when present. */
  replayed: boolean;
  /** The trimmed response body. The API returns ~30 fields; a panel that
   *  printed all of them would be a wall, and a panel that invented fields
   *  would be worse. These are verbatim keys from `serializeMessage()`. */
  body: {
    id: string;
    object: string;
    status: string;
    to: string;
    subject: string | null;
    sandbox: boolean;
  };
  /** Present only when this is NOT live: why, in the user's tense. */
  note?: string;
}

/**
 * The address every demo send is forced to, server-side.
 *
 * `delivered@test.rootmail.dev` is one of rootmail's reserved test recipients
 * (`packages/core/src/constants.ts` → TEST_RECIPIENTS): the send takes the real
 * path and the SES mailbox simulator receives it. That is what makes a public
 * demo safe — it cannot be turned into a mailer, because a visitor-supplied
 * recipient is never accepted in the first place.
 */
export const DEMO_RECIPIENT = "delivered@test.rootmail.dev";
export const DEMO_SUBJECT = "Your booking is confirmed";

/** The mono line every demo panel carries. Not decoration — it is the disclosure. */
export const DEMO_DISCLOSURE =
  "sandbox · real API · rate limited · recipients forced to the mailbox simulator";

/**
 * The resting state, and the fallback.
 *
 * Rendered server-side so the fold is never empty and nothing on this page
 * waits on a click (Law 1). Pressing a button replaces it with a live run.
 * The id is a real rootmail id — 24 lowercase base32 characters after the
 * prefix, per `packages/core/src/ids.ts`. A ULID-shaped id would be the first
 * thing a developer noticed was fake.
 */
export const CACHED_SEND: DemoRun = {
  live: false,
  status: 202,
  statusText: "Accepted",
  ms: 218,
  replayed: false,
  body: {
    id: "msg_8haaujzmx7g3pv5kjlsoon5e",
    object: "message",
    status: "queued",
    to: DEMO_RECIPIENT,
    subject: DEMO_SUBJECT,
    sandbox: true,
  },
  note: "cached example",
};

/** The replay of the same key: same id, 200 instead of 202, and the header. */
export const CACHED_REPLAY: DemoRun = {
  ...CACHED_SEND,
  status: 200,
  statusText: "OK",
  ms: 31,
  replayed: true,
  note: "cached example",
};

/**
 * `application/json` pretty-printed the way the panels show it.
 *
 * D1 prints the whole body — that section's job is "read what comes back". D3
 * prints `compact`, which is `id` and `status` only, because that section's
 * entire argument is that the id is IDENTICAL in two responses and six fields
 * of agreement bury the one that matters.
 */
export function renderBody(run: DemoRun, compact = false): string {
  const body = compact ? { id: run.body.id, status: run.body.status } : run.body;
  return JSON.stringify(body, null, 2);
}
