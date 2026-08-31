import type { LiveRow, Station } from "@rootmail/design";

/**
 * THE FOUR CASES THE HERO SHOWS.
 *
 * The hero used to carry exactly one record — a booking confirmation — drawn
 * once and never varied. The owner's note: *"we can give depth to that 'Your
 * booking is confirmed' example. You can be showing different things in
 * different cases that are possible with rootmail."*
 *
 * These are the four, and they are chosen so that the SET makes an argument
 * the single record could not:
 *
 *   receipt   the happy path — and the open is still hollow
 *   campaign  the same drawing, for marketing mail, in one system
 *   reply     the ONE engagement signal we actually witness
 *   bounce    the line severs, and the address is suppressed
 *
 * Every station obeys the rendering law (`packages/design/src/line.tsx`) and
 * the law is enforced there, not here: `Opened` and `Clicked` are `inferred`
 * and draw hollow, forever. `Replied` is `witnessed` because the inbound
 * message arrived at our own server — that is an observation, not a pixel, and
 * the contrast between the hollow node above it and the solid node beside it
 * is the whole product in one glyph.
 *
 * `rows` must never be LONGER than `stations`: `LiveLine` maps a hovered row
 * index straight onto `stations[i]`, so a sixth row would read past the end.
 */

export type HeroRecord = {
  key: string;
  /** What kind of mail this is. Plain words — this is not a recorded value. */
  kind: string;
  id: string;
  to: string;
  subject: string;
  stations: Station[];
  rows: LiveRow[];
  /** Milliseconds from the start of a replay at which each station arrives. */
  timeline: number[];
};

export const HERO_RECORDS: HeroRecord[] = [
  {
    key: "receipt",
    kind: "receipt",
    id: "msg_01J9Q7F2XKB4M0RVTC8H",
    to: "ana@sunsetvillas.com",
    subject: "Your booking is confirmed",
    stations: [
      { label: "Queued", state: "witnessed", at: "09:14:02" },
      { label: "Sent", state: "witnessed", at: "09:14:03" },
      { label: "Delivered", state: "witnessed", at: "09:14:07" },
      { label: "Opened", state: "inferred", at: "09:41:55" },
      { label: "Clicked", state: "unknown", at: "—" },
    ],
    rows: [
      { at: "09:14:02", event: "queued", note: "accepted by the API" },
      { at: "09:14:03", event: "sent", note: "handed to the provider" },
      { at: "09:14:07", event: "delivered", note: "provider confirmed" },
      {
        at: "09:41:55",
        event: "opened",
        note: "tracking pixel",
        // Promoted out of the FAQ, where this argument sat at position 8 behind
        // a chevron. It is the product's entire differentiating claim and it
        // costs one click.
        explain:
          "A pixel loaded at 09:41:55. Roughly a third of these are a mail client prefetching an image, so we draw it hollow. Always.",
      },
      { at: "—", event: "clicked", note: "no event · we do not know" },
    ],
    timeline: [0, 400, 1100, 2400, 3400],
  },
  {
    key: "campaign",
    kind: "campaign",
    id: "msg_01J9QB4T7NC2X8HKD3M0",
    to: "dana@lakeshore.co",
    subject: "What changed in your dashboard this month",
    stations: [
      { label: "Queued", state: "witnessed", at: "06:00:11" },
      { label: "Sent", state: "witnessed", at: "06:00:14" },
      { label: "Delivered", state: "witnessed", at: "06:00:22" },
      { label: "Opened", state: "inferred", at: "08:37:40" },
      { label: "Clicked", state: "inferred", at: "08:38:02" },
    ],
    rows: [
      { at: "06:00:11", event: "queued", note: "1 of 4,812 · same pipeline" },
      { at: "06:00:14", event: "sent", note: "handed to the provider" },
      { at: "06:00:22", event: "delivered", note: "provider confirmed" },
      { at: "08:37:40", event: "opened", note: "tracking pixel" },
      {
        at: "08:38:02",
        event: "clicked",
        note: "redirect followed",
        explain:
          "A redirect was followed at 08:38:02. A security scanner opening every link in a message follows it the same way a person does, and we cannot tell them apart — so this stays hollow too.",
      },
    ],
    timeline: [0, 400, 1100, 2400, 3400],
  },
  {
    key: "reply",
    kind: "reply",
    id: "msg_01J9QC8W2PD5R1TFN6Y4",
    to: "sam@northgate.co",
    subject: "Your invoice for July",
    stations: [
      { label: "Queued", state: "witnessed", at: "11:02:40" },
      { label: "Sent", state: "witnessed", at: "11:02:41" },
      { label: "Delivered", state: "witnessed", at: "11:02:46" },
      { label: "Opened", state: "inferred", at: "11:09:12" },
      { label: "Replied", state: "witnessed", at: "11:12:03" },
    ],
    rows: [
      { at: "11:02:40", event: "queued", note: "accepted by the API" },
      { at: "11:02:41", event: "sent", note: "handed to the provider" },
      { at: "11:02:46", event: "delivered", note: "provider confirmed" },
      { at: "11:09:12", event: "opened", note: "tracking pixel" },
      {
        at: "11:12:03",
        event: "replied",
        note: "inbound message received · threaded",
        explainLabel: "why solid?",
        explain:
          "Solid, where the open above it is hollow. A reply is not a guess: their message arrived at our inbound server and is in the thread. It is the one engagement signal we witness rather than infer.",
      },
    ],
    timeline: [0, 400, 1100, 2400, 3400],
  },
  {
    key: "bounce",
    kind: "bounce",
    id: "msg_01J9QDF6ZQ0B8VMH4K2S",
    to: "old@vantagepartners.io",
    subject: "Reset your password",
    stations: [
      { label: "Queued", state: "witnessed", at: "22:41:08" },
      { label: "Sent", state: "witnessed", at: "22:41:09" },
      {
        label: "Bounced",
        state: "stopped",
        reason: "550 5.1.1 mailbox does not exist",
      },
    ],
    rows: [
      { at: "22:41:08", event: "queued", note: "accepted by the API" },
      { at: "22:41:09", event: "sent", note: "handed to the provider" },
      {
        at: "22:41:11",
        event: "bounced",
        note: "550 5.1.1 · address suppressed",
        explainLabel: "why does it stop here?",
        explain:
          "The provider's own words, kept verbatim. The address went onto your suppression list at the same second, so the next send to it never leaves — and nothing is drawn past the bar, because nothing happened past it.",
      },
    ],
    timeline: [0, 400, 1100],
  },
];
