import type { Metadata } from "next";
import { adminApi } from "@/lib/admin-api";
import type { AdminBlogPost, AdminChangelogEntry } from "@/lib/types";
import { BlogManager } from "./blog-manager";
import { ChangelogManager } from "./changelog-manager";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage() {
  let posts: AdminBlogPost[] = [];
  let entries: AdminChangelogEntry[] = [];
  let error = "";
  try {
    const [b, c] = await Promise.all([adminApi.listBlogPosts(), adminApi.listChangelog()]);
    posts = b.data;
    entries = c.data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load content.";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Write and publish the marketing blog and changelog. Publishing pushes to the site
          immediately — drafts stay private until you publish them.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <BlogManager posts={posts} />
      <ChangelogManager entries={entries} />
    </div>
  );
}
