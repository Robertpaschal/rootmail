"use client";

import { type ReactNode, useActionState, useState } from "react";
import { deleteBlogPost, saveBlogPost, type CmsState } from "./actions";
import type { AdminBlogPost, PostCategory } from "@/lib/types";
import { Markdown } from "@/components/app/markdown";
import { cn } from "@/lib/utils";

const CATEGORIES: PostCategory[] = ["Company", "Guide", "Things we like"];
const field = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        status === "published"
          ? "rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-600"
          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      }
    >
      {status}
    </span>
  );
}

export function BlogManager({ posts }: { posts: AdminBlogPost[] }) {
  const [editing, setEditing] = useState<AdminBlogPost | null>(null);

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-medium">Blog posts</h2>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          + New post
        </button>
      </header>

      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1.2fr]">
        {/* List */}
        <ul className="space-y-1.5">
          {posts.length === 0 ? (
            <li className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No posts yet — create one on the right.
            </li>
          ) : (
            posts.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  editing?.id === p.id && "border-primary ring-1 ring-primary/30",
                )}
              >
                <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-medium hover:underline">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">/{p.slug}</p>
                </button>
                <StatusBadge status={p.status} />
                <form action={deleteBlogPost}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>

        {/* Create / edit — keyed so switching rows resets fields + preview state. */}
        <PostForm key={editing?.id ?? "new"} post={editing} />
      </div>
    </section>
  );
}

/** The editor with a live Edit/Preview toggle — preview renders the post exactly as
 * the marketing site would, so staff can see it before publishing without leaving admin. */
function PostForm({ post }: { post: AdminBlogPost | null }) {
  const [state, action, pending] = useActionState<CmsState, FormData>(saveBlogPost, {});
  // Selecting an existing post opens its preview first; a new post starts in edit.
  const [tab, setTab] = useState<"edit" | "preview">(post ? "preview" : "edit");
  const [title, setTitle] = useState(post?.title ?? "");
  const [description, setDescription] = useState(post?.description ?? "");
  const [body, setBody] = useState(post?.body ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{post ? "Edit post" : "New post"}</p>
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-2.5 py-1 font-medium capitalize transition-colors",
                tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Kept mounted (hidden) during preview so field values + submit are preserved. */}
      <form action={action} className={cn("space-y-3", tab === "preview" && "hidden")}>
        <input type="hidden" name="id" value={post?.id ?? ""} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug">
            <input name="slug" defaultValue={post?.slug ?? ""} required placeholder="my-post" className={field} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={post?.status ?? "draft"} className={field}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>
        <Field label="Title">
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={field} />
        </Field>
        <Field label="Description">
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={field}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select name="category" defaultValue={post?.category ?? "Company"} className={field}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Author">
            <input name="author" defaultValue={post?.author ?? "rootmail"} className={field} />
          </Field>
        </div>
        <Field label="Body (Markdown)">
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="# Heading&#10;&#10;Write the post in **markdown**…"
            className={`${field} font-mono`}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Or make it a curated link (no article page) — fill the external URL and its source:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="External URL (optional)">
            <input
              name="external_url"
              type="url"
              defaultValue={post?.external_url ?? ""}
              placeholder="https://…"
              className={field}
            />
          </Field>
          <Field label="Link source">
            <input name="source" defaultValue={post?.source ?? ""} placeholder="example.com" className={field} />
          </Field>
        </div>

        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-green-600">Saved.</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : post ? "Update post" : "Create post"}
        </button>
      </form>

      {tab === "preview" ? (
        <article className="rounded-md border p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Preview · how it appears on the site
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title || "Untitled"}</h1>
          {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
          <div className="mt-5">
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                No body yet — write markdown in the Edit tab, or this is a curated link post.
              </p>
            )}
          </div>
        </article>
      ) : null}
    </div>
  );
}
