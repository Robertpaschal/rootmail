"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminBlogPost, AdminChangelogEntry } from "@/lib/types";
import { BlogManager } from "./blog-manager";
import { ChangelogManager } from "./changelog-manager";

/** Blog and changelog are distinct surfaces — show one at a time (not a long
 * vertical stack). Each opens its items preview-first. */
export function ContentTabs({
  posts,
  entries,
}: {
  posts: AdminBlogPost[];
  entries: AdminChangelogEntry[];
}) {
  const [tab, setTab] = useState<"blog" | "changelog">("blog");
  const tabs = [
    { key: "blog" as const, label: `Blog · ${posts.length}` },
    { key: "changelog" as const, label: `Changelog · ${entries.length}` },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-0.5 text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3.5 py-1.5 font-medium transition-colors",
              tab === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "blog" ? <BlogManager posts={posts} /> : <ChangelogManager entries={entries} />}
    </div>
  );
}
