import type { ChangeItem } from "@rootmail/core";
import { newId } from "@rootmail/core";
import { closeDb, db } from "./client";
import { changelogEntries } from "./schema";

// Prod-safe, idempotent: publishes the early-July release notes that shipped after
// the 2026-06-29 entries. Dedupes by title, so re-running is a no-op. Run it like
// the pricing/cms seeds (e.g. on the api host:
//   docker compose run --rm --no-deps api pnpm db:seed:changelog
// ), then revalidate the marketing changelog tag.

// NOTE: the Python/Go SDK changelog entry is intentionally held until they're
// published to PyPI / pkg.go.dev (otherwise "pip install rootmail" would 404).
// Add it back here as part of the publish step.
const ENTRIES: { title: string; date: string; changes: ChangeItem[] }[] = [
  {
    title: "Pay per wing — pricing you can actually choose",
    date: "2026-07-08",
    changes: [
      {
        kind: "New",
        text: "Per-wing pricing is live: Transactional is sized by send volume, Marketing by contacts, and Platform by your team — each on its own plan, billed on its own. Be Free on one side and scale the other; you only pay for what you use.",
      },
      {
        kind: "New",
        text: "Pick a tier right from Plan & usage → Pricing by wing: paid tiers check out through Stripe, Free tiers apply instantly, and wings you haven't chosen start on Free.",
      },
      {
        kind: "New",
        text: "Not sure what fits? Answer three questions — emails per month, contacts, team size — and we'll recommend a tier per wing with a combined monthly total.",
      },
    ],
  },
  {
    title: "Lists are now Audiences",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The marketing side now speaks in audiences — the distinct groups of people you communicate with (customers, subscribers, beta users). Create one, then send a campaign or sequence to exactly the right audience.",
      },
      {
        kind: "Improved",
        text: "The Audiences page shows how many audiences you have and your total memberships, and explains that a contact in more than one audience is counted in each — how contact-based marketing plans are sized.",
      },
    ],
  },
  {
    title: "Know exactly what's left to set up",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Overview now tracks your setup progress — how many steps are left and roughly how long — and calls out the ones that actually block sending, like verifying a sending address, broken into clear sub-steps.",
      },
      {
        kind: "Improved",
        text: "Composing an email now reminds you to verify a sending address if you haven't yet, so mail can go out from your own domain instead of a rootmail one.",
      },
      {
        kind: "Improved",
        text: "The ⌘K search is refreshed and context-aware: grouped by the wing you're working in, with billing, add-ons, and settings all reachable — and it understands synonyms, so “domains”, “spf”, or “upgrade” find the right place.",
      },
    ],
  },
  {
    title: "Clearer wings, honest unlock pricing",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The Transactional and Marketing wings now explain themselves in plain English — a one-line description under the switcher and a tooltip on hover, so you always know what each side is for without any prior knowledge.",
      },
      {
        kind: "Fixed",
        text: "Locked sections were showing the unlocking plan's price far too small (a formatting bug — e.g. $0.80 instead of $80). They now show the plan's real price and make clear it unlocks the whole plan, not just that one feature.",
      },
      {
        kind: "Improved",
        text: "“Domains” is now “Client domains” — clearly distinct from your own from-address (which lives in Settings → Sending), so the two are never confused.",
      },
    ],
  },
  {
    title: "A design studio for your templates",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Creating a template now opens a design gallery: pick a ready-made layout — Welcome, Password reset, Receipt or Notification for transactional; Newsletter, Announcement or Promotion for marketing — see it rendered as a real email, and edit it endlessly. No blank page to stare at.",
      },
      {
        kind: "Improved",
        text: "Template setup speaks plainly: choose “what's this for?” (Transactional or Marketing) instead of a raw type field, and the API slug is generated for you and tucked under Developer details.",
      },
    ],
  },
  {
    title: "Plans and templates, in the two wings",
    date: "2026-07-07",
    changes: [
      {
        kind: "Improved",
        text: "The plan comparison now groups everything by what it's for — Transactional, Marketing, and Platform — and takes the time to explain, in plain words, what each feature actually does for you.",
      },
      {
        kind: "Improved",
        text: "Your templates shelve by purpose: Transactional blocks for product email, Marketing designs for your audience — opening on the shelf that matches where you're working.",
      },
    ],
  },
  {
    title: "Send as yourself — your own from-address",
    date: "2026-07-07",
    changes: [
      {
        kind: "New",
        text: "Add your own from-addresses under Settings → Sending: we email that inbox a confirmation link, and once clicked it appears in compose's From menu — hello@yourcompany.com instead of a rootmail address.",
      },
      {
        kind: "New",
        text: "Replies follow your business: mail sent from your address returns to your real inbox, no forwarding setup needed.",
      },
      {
        kind: "Improved",
        text: "If a send uses an unverified From, we now tell you plainly and point you to the fix — instead of a cryptic provider error.",
      },
      {
        kind: "Improved",
        text: "Templates now shelve by what they're for — Transactional blocks vs Marketing designs — and open on the shelf matching the wing you're working in.",
      },
      {
        kind: "Improved",
        text: "The plan comparison takes the time to explain what each feature actually does, in plain words under every line.",
      },
    ],
  },
  {
    title: "Compose that looks like email",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "Composing is now a real email surface: From, To, Subject, your message — with a live preview of exactly what your recipient gets, updating as you type.",
      },
      {
        kind: "New",
        text: "Templates are woven into writing: pick one under “Start from” and the preview fills in; add personalization and watch the placeholders resolve.",
      },
      {
        kind: "Improved",
        text: "No more jargon in the way — technical fields are gone or tucked behind Advanced, page descriptions across the dashboard now say what each section does in plain words, and upgrade buttons go straight to checkout.",
      },
    ],
  },
  {
    title: "Two dashboards: Transactional and Marketing",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "The dashboard now has two clear wings, because they're two different jobs: Transactional (the send API, templates & blocks, message log, domains, deliverability) and Marketing (campaigns, sequences, replies, audience, engagement). Switch with one click — rootmail remembers where you work.",
      },
      {
        kind: "Improved",
        text: "The primary action follows the wing: “Send email” in Transactional, “New campaign” in Marketing.",
      },
    ],
  },
  {
    title: "A proper welcome — onboarding that sets you up right",
    date: "2026-07-06",
    changes: [
      {
        kind: "New",
        text: "New accounts get a short guided setup: your business details (the postal address anti-spam law requires — added to your marketing footers automatically), what you do, and how you send today. Each step says why we ask.",
      },
      {
        kind: "New",
        text: "Setup ends with a plan recommendation matched to your answers — prices stay pinned while you compare what each tier actually does, and continuing on Free is always one click.",
      },
      {
        kind: "Improved",
        text: "Coming from SendGrid, Mailgun, Postmark, or Mailchimp? Telling us during setup points the migration importer at the right export from day one.",
      },
      {
        kind: "Improved",
        text: "Locked sections now show what they'd do for you — the concrete capabilities and the live price of the plan that unlocks them — instead of just a lock icon.",
      },
    ],
  },
  {
    title: "Single sign-on (SAML) for your team",
    date: "2026-07-04",
    changes: [
      {
        kind: "New",
        text: "Enterprise workspaces can now connect a SAML identity provider — Okta, Microsoft Entra ID, Google Workspace, or any SAML 2.0 IdP. Set it up in Settings → Single sign-on.",
      },
      {
        kind: "New",
        text: "Members sign in with “Log in with SSO”: enter your work email and you're routed to your company's identity provider. New teammates are provisioned automatically on first login.",
      },
      {
        kind: "New",
        text: "Optional enforcement turns off password login for your domain, so everyone signs in through your IdP.",
      },
      {
        kind: "New",
        text: "SCIM 2.0 provisioning: connect it in your identity provider and members are created, updated, and deactivated automatically — deprovisioned people lose access immediately.",
      },
    ],
  },
  {
    title: "Clearer settings, enterprise foundations",
    date: "2026-07-04",
    changes: [
      {
        kind: "Improved",
        text: "Settings is reorganized into clear tabs — Profile, Security & login, and Sender address — so each is a real page you can open directly, instead of a hub that led with your profile.",
      },
      {
        kind: "New",
        text: "Your Compliance page now shows data residency — exactly where this organization's data is stored and processed.",
      },
      {
        kind: "New",
        text: "We've mapped rootmail's security controls to the SOC 2 criteria as part of becoming enterprise-ready.",
      },
    ],
  },
  {
    title: "Send like a real business — compliance & migration",
    date: "2026-07-03",
    changes: [
      {
        kind: "New",
        text: "Set your business's postal address in Settings → Sender address; it's added automatically to marketing and sales footers to meet anti-spam law, with a live preview as you type.",
      },
      {
        kind: "New",
        text: "Bulk mail now carries one-click unsubscribe headers (RFC 8058), so Gmail and Yahoo show their native unsubscribe button — which keeps you on the right side of their bulk-sender rules.",
      },
      {
        kind: "New",
        text: "Import a template — upload or paste HTML from any provider, preview it, and save it as a rootmail template. SendGrid's Handlebars placeholders carry over unchanged.",
      },
      {
        kind: "New",
        text: "A hosted test inbox: every sandbox send appears in the dashboard with its full rendered content — no real mailbox needed, and it never touches your reputation.",
      },
      {
        kind: "Improved",
        text: "Contact and suppression import now takes a drag-in CSV file, not just paste — bring your SendGrid, Postmark, or Mailgun export straight in.",
      },
    ],
  },
  {
    title: "Upgrade where you hit the limit",
    date: "2026-07-01",
    changes: [
      {
        kind: "New",
        text: "Plan & usage is now two tabs — your current plan and usage on one, a full plan comparison with checkout on the other.",
      },
      {
        kind: "New",
        text: "Every limit you meet — send quota, workspaces, AI credits, a locked feature — links straight to the plan comparison, with a recommendation matched to your actual usage.",
      },
      {
        kind: "Improved",
        text: "Yearly prices show exactly what you save, each tier lists what it adds over the previous one, and the promo-code entry point is clearer.",
      },
    ],
  },
  {
    title: "See how every campaign lands",
    date: "2026-07-02",
    changes: [
      {
        kind: "New",
        text: "Campaigns and sequences now have engagement analytics — the sent → delivered → opened → clicked funnel per campaign, and per-step drop-off for sequences.",
      },
      {
        kind: "New",
        text: "Lifecycle email, done for you: payment receipts, password-change notices, a heads-up as you approach your monthly quota, and a nudge if you've been away a while.",
      },
      {
        kind: "Improved",
        text: "The AI assistant plans multi-step work — it discovers what exists, reuses it instead of duplicating, builds the rest, and ends with a checklist of everything it did.",
      },
      {
        kind: "Improved",
        text: "Messages in the dashboard are searchable and paged, so big send histories stay navigable.",
      },
    ],
  },
];

async function main(): Promise<void> {
  const existing = new Set(
    (await db.select({ title: changelogEntries.title }).from(changelogEntries)).map((r) => r.title),
  );
  let inserted = 0;
  for (const e of ENTRIES) {
    if (existing.has(e.title)) continue;
    await db.insert(changelogEntries).values({
      id: newId("changelogEntry"),
      title: e.title,
      entryDate: new Date(`${e.date}T12:00:00Z`),
      changes: e.changes,
      status: "published",
      publishedAt: new Date(),
      createdBy: null,
    });
    inserted++;
  }
  console.log(`changelog seed: ${inserted} inserted, ${ENTRIES.length - inserted} already present`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
