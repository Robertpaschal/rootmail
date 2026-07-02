import type { ChangeItem } from "@rootmail/core";
import { newId } from "@rootmail/core";
import { closeDb, db } from "./client";
import { changelogEntries } from "./schema";

// Prod-safe, idempotent: publishes the early-July release notes that shipped after
// the 2026-06-29 entries. Dedupes by title, so re-running is a no-op. Run it like
// the pricing/cms seeds (e.g. on the api host:
//   docker compose run --rm --no-deps api pnpm db:seed:changelog
// ), then revalidate the marketing changelog tag.

const ENTRIES: { title: string; date: string; changes: ChangeItem[] }[] = [
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
