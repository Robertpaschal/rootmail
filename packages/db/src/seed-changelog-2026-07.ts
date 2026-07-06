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
