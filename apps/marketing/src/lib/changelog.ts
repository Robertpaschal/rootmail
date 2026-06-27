// The product changelog. To add an entry, prepend a new object to `changelog`
// (newest first) with an ISO `date`, a short `title`, and one or more `changes`,
// each tagged "New" | "Improved" | "Fixed". Keep it user-facing: describe what
// someone can now do, not how it was built. No internal/lifecycle jargon.

export type ChangeKind = "New" | "Improved" | "Fixed";

export interface ChangeItem {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogEntry {
  /** ISO date, e.g. "2026-06-20". */
  date: string;
  /** Short headline for the release. */
  title: string;
  changes: ChangeItem[];
}

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-06-24",
    title: "Deliverability you can act on",
    changes: [
      {
        kind: "New",
        text: "A 0–100 deliverability score, computed from your real sending outcomes, with the specific factors hurting it and concrete fixes — per workspace or per sub-tenant.",
      },
      {
        kind: "New",
        text: "Domain authentication guidance: see your SPF, DKIM, DMARC, and BIMI status at a glance, with the exact DNS record to publish to strengthen a weak setup.",
      },
      {
        kind: "Improved",
        text: "New sending domains now ship with a starter DMARC record in their setup instructions, so you start protected by default.",
      },
    ],
  },
  {
    date: "2026-06-18",
    title: "Move in from any provider",
    changes: [
      {
        kind: "New",
        text: "One-click import of your contacts and suppression list from a SendGrid, Postmark, or Mailgun export — bounce, complaint, and unsubscribe reasons are normalized and deduplicated so you keep your history.",
      },
      {
        kind: "Improved",
        text: "Imported contacts are deliberately not auto-enrolled into sequences, so a migration never surprises your audience with mail they didn't expect.",
      },
    ],
  },
  {
    date: "2026-06-12",
    title: "An assistant that does the work",
    changes: [
      {
        kind: "New",
        text: "The in-app AI assistant now builds (templates, lists, sequences, campaigns), operates (adds contacts, sends or schedules), and diagnoses — ask “why did this bounce?” and it reads the audit trail and suppression list to explain the fix.",
      },
      {
        kind: "Improved",
        text: "The reason a message bounced is now saved on the message itself, so it shows up in the dashboard and the API, not just in the assistant.",
      },
    ],
  },
  {
    date: "2026-06-05",
    title: "See what's working",
    changes: [
      {
        kind: "New",
        text: "An engagement funnel — sent → delivered → opened → clicked — with open and click rates, a daily send trend, and your top-performing templates, in the dashboard and over the API.",
      },
      {
        kind: "New",
        text: "Audit-grade compliance exports: download an Ed25519-signed bundle of every message, content hash, and delivery trail in a date range, verifiable by anyone.",
      },
      {
        kind: "Fixed",
        text: "Open and click tracking now resolves correctly behind privacy proxies that pre-fetch links.",
      },
    ],
  },
  {
    date: "2026-05-28",
    title: "Reach your whole list",
    changes: [
      {
        kind: "New",
        text: "Build contact lists and send campaigns to all of them, or set up drip sequences with delays that automatically stop when someone replies.",
      },
      {
        kind: "New",
        text: "A shared inbox: inbound replies are parsed, threaded against the original message, and routed back to your team or your app via webhook.",
      },
      {
        kind: "Improved",
        text: "The no-code template editor gained a live preview and AI-assisted drafting.",
      },
    ],
  },
];
