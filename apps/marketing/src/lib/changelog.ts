// The product changelog. The /changelog page shows admin-managed entries from the
// API merged with this static baseline — newest first, deduped, with the static
// array as the resilient fallback when the API is unreachable. To add a baseline
// entry, prepend an object here; staff publish live entries in apps/admin.

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
    date: "2026-06-29",
    title: "A sharper assistant, profiles, and support on tap",
    changes: [
      {
        kind: "Improved",
        text: "The AI assistant now names each conversation from what you actually asked, lets you rename any chat inline, and has a roomier composer that grows as you type — with clear send and keyboard hints.",
      },
      {
        kind: "New",
        text: "Make the account yours — set a display name and upload a profile picture in Settings → Profile, shown across the app.",
      },
      {
        kind: "New",
        text: "Reach a human without leaving the dashboard: “Contact support” sits right next to the assistant, so you can escalate whenever you want to.",
      },
    ],
  },
  {
    date: "2026-06-29",
    title: "Workspaces, and annual billing end to end",
    changes: [
      {
        kind: "New",
        text: "Multiple workspaces — keep each product or brand fully separate, with its own domains, contacts, and keys, and switch between them from the top bar. Plans include from 1 on Free up to unlimited on Enterprise, and a +5 workspace add-on tops up any plan.",
      },
      {
        kind: "New",
        text: "Rename or remove a workspace in place. Your sandbox and your last remaining live workspace are protected, so you can't lock yourself out.",
      },
      {
        kind: "Improved",
        text: "Annual billing now covers add-ons too — pay yearly on seats, dedicated IPs, sub-tenant and workspace packs, and AI credits, with the same two months free as the plan.",
      },
      {
        kind: "Improved",
        text: "On an annual plan, sending over your monthly volume is still billed monthly as usage — so you keep the yearly discount without giving up pay-as-you-grow.",
      },
    ],
  },
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

const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

/**
 * The changelog for the marketing page: admin-managed entries (from the API)
 * merged with the static baseline above, newest first. On-demand ISR — revalidated
 * by the `changelog` tag when staff publish (the API POSTs /api/revalidate), with a
 * long backstop. Falls back to the static baseline if the API is unreachable.
 */
export async function getPublicChangelog(): Promise<ChangelogEntry[]> {
  let live: ChangelogEntry[] = [];
  try {
    const res = await fetch(new URL("/v1/changelog", API_URL), {
      next: { revalidate: 3600, tags: ["changelog"] },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { title: string; date: string; changes: ChangeItem[] }[] };
      live = (json.data ?? []).map((e) => ({
        title: e.title,
        date: e.date.slice(0, 10), // normalize ISO datetime → YYYY-MM-DD
        changes: e.changes,
      }));
    }
  } catch {
    // API unreachable → static baseline only.
  }
  // Live entries win on an exact (date,title) clash; otherwise both show.
  const seen = new Set(live.map((e) => `${e.date}|${e.title}`));
  const merged = [...live, ...changelog.filter((e) => !seen.has(`${e.date}|${e.title}`))];
  return merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
