/**
 * One-time (idempotent) seed: migrate the in-code marketing baseline — blog posts
 * (articles → markdown, curated link posts) and changelog entries — into the CMS
 * DB so staff can edit them in Admin → Content. Safe to re-run: it skips anything
 * already present (blog by slug, changelog by date+title).
 *
 *   pnpm db:seed:cms                          # local (.env)
 *   # prod (on the API host, RDS via .env.prod, after migrate 0033 + new image):
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     run --rm --no-deps api pnpm db:seed:cms
 */
import { newId } from "@rootmail/core";
import { isArticle, posts, type Block } from "../../../apps/marketing/src/lib/blog";
import { changelog } from "../../../apps/marketing/src/lib/changelog";
import { db } from "./client";
import { blogPosts, changelogEntries } from "./schema";

function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h2":
          return `## ${b.text}`;
        case "p":
          return b.text;
        case "ul":
          return b.items.map((i) => `- ${i}`).join("\n");
        case "quote":
          return `> ${b.text}`;
      }
    })
    .join("\n\n");
}

// Noon UTC keeps a date-only value off the day boundary in any timezone.
const at = (date: string) => new Date(`${date}T12:00:00Z`);

async function seedBlog(): Promise<void> {
  const existing = await db.select({ slug: blogPosts.slug }).from(blogPosts);
  const seen = new Set(existing.map((r) => r.slug));
  let created = 0;
  for (const p of posts) {
    if (seen.has(p.slug)) continue;
    const article = isArticle(p);
    await db.insert(blogPosts).values({
      id: newId("blogPost"),
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      author: p.author,
      body: article ? blocksToMarkdown(p.body) : "",
      externalUrl: article ? null : p.externalUrl,
      source: article ? null : p.source,
      status: "published",
      publishedAt: at(p.date),
    });
    created++;
  }
  console.log(`blog: ${created} created, ${posts.length - created} already present`);
}

async function seedChangelog(): Promise<void> {
  const existing = await db
    .select({ title: changelogEntries.title, entryDate: changelogEntries.entryDate })
    .from(changelogEntries);
  const seen = new Set(existing.map((r) => `${r.entryDate.toISOString().slice(0, 10)}|${r.title}`));
  let created = 0;
  for (const e of changelog) {
    if (seen.has(`${e.date}|${e.title}`)) continue;
    await db.insert(changelogEntries).values({
      id: newId("changelogEntry"),
      title: e.title,
      entryDate: at(e.date),
      changes: e.changes,
      status: "published",
      publishedAt: at(e.date),
    });
    created++;
  }
  console.log(`changelog: ${created} created, ${changelog.length - created} already present`);
}

async function main(): Promise<void> {
  await seedBlog();
  await seedChangelog();
  console.log("✓ CMS seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
