"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ListChecks, Plus } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";
import type { AdminBlogPost, AdminChangelogEntry } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "./status-badge";

/** The content library: blog and changelog as separate tabs of clickable documents.
 * A row opens its full-page editor (preview-first there); writing happens on that
 * page, Notion-style — this list stays a clean index. */
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Link
          href={tab === "blog" ? "/content/posts/new" : "/content/changelog/new"}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> {tab === "blog" ? "New post" : "New entry"}
        </Link>
      </div>

      {tab === "blog" ? (
        <ul className="divide-y rounded-lg border">
          {posts.length === 0 ? (
            <li>
              <EmptyState
                icon={FileText}
                title="No posts yet"
                description="Start writing and it lands on the marketing blog the moment you publish."
                action={
                  <Link href="/content/posts/new" className="text-sm font-medium text-primary hover:underline">
                    Write the first post →
                  </Link>
                }
              />
            </li>
          ) : (
            posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/content/posts/${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      /{p.slug} · {p.category} · {formatDate(p.date)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.length === 0 ? (
            <li>
              <EmptyState
                icon={ListChecks}
                title="No changelog entries yet"
                description="Log what shipped — entries appear on the public changelog when published."
                action={
                  <Link href="/content/changelog/new" className="text-sm font-medium text-primary hover:underline">
                    Write the first entry →
                  </Link>
                }
              />
            </li>
          ) : (
            entries.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/content/changelog/${e.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.date.slice(0, 10)} · {e.changes.length} change{e.changes.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
