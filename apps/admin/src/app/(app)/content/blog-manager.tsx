"use client";

import { type ReactNode, useActionState, useState } from "react";
import { deleteBlogPost, saveBlogPost, type CmsState } from "./actions";
import type { AdminBlogPost, PostCategory } from "@/lib/types";

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
  const [state, action, pending] = useActionState<CmsState, FormData>(saveBlogPost, {});

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
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">/{p.slug}</p>
                </div>
                <StatusBadge status={p.status} />
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  Edit
                </button>
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

        {/* Create / edit form — keyed so switching rows resets the fields. */}
        <form key={editing?.id ?? "new"} action={action} className="space-y-3">
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <p className="text-sm font-medium">{editing ? "Edit post" : "New post"}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slug">
              <input name="slug" defaultValue={editing?.slug ?? ""} required placeholder="my-post" className={field} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={editing?.status ?? "draft"} className={field}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
          </div>
          <Field label="Title">
            <input name="title" defaultValue={editing?.title ?? ""} required className={field} />
          </Field>
          <Field label="Description">
            <input name="description" defaultValue={editing?.description ?? ""} className={field} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select name="category" defaultValue={editing?.category ?? "Company"} className={field}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Author">
              <input name="author" defaultValue={editing?.author ?? "rootmail"} className={field} />
            </Field>
          </div>
          <Field label="Body (Markdown)">
            <textarea
              name="body"
              defaultValue={editing?.body ?? ""}
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
                defaultValue={editing?.external_url ?? ""}
                placeholder="https://…"
                className={field}
              />
            </Field>
            <Field label="Link source">
              <input name="source" defaultValue={editing?.source ?? ""} placeholder="example.com" className={field} />
            </Field>
          </div>

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.ok ? <p className="text-sm text-green-600">Saved.</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : editing ? "Update post" : "Create post"}
          </button>
        </form>
      </div>
    </section>
  );
}
