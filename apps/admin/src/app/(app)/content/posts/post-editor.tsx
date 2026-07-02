"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Markdown } from "@/components/app/markdown";
import { cn } from "@/lib/utils";
import type { AdminBlogPost, CmsStatus, PostCategory } from "@/lib/types";
import { deleteBlogPost, saveBlogPost, type CmsState } from "../actions";
import { StatusBadge } from "../status-badge";

const CATEGORIES: PostCategory[] = ["Company", "Guide", "Things we like"];

// Notion-ish property input: quiet until you interact with it.
const prop =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-border focus:border-ring";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * The full-page, Notion-style post editor: one document you open, write in, and
 * preview — with Save draft / Publish as the only ceremony. Creation starts from
 * the same empty page; nothing goes live until Publish.
 */
export function PostEditor({ post }: { post: AdminBlogPost | null }) {
  const router = useRouter();
  const [state, action] = useActionState<CmsState, FormData>(saveBlogPost, {});
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [status, setStatus] = useState<CmsStatus>(post?.status ?? "draft");

  const [title, setTitle] = useState(post?.title ?? "");
  const [description, setDescription] = useState(post?.description ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));

  // A brand-new document moves onto its own page once it exists; saves also
  // reflect the server's status (publish/unpublish) without a refetch.
  useEffect(() => {
    if (!state.ok) return;
    if (state.status) setStatus(state.status);
    if (!post && state.id) router.replace(`/content/posts/${state.id}`);
  }, [state, post, router]);

  // The body grows with the document instead of scrolling inside a box.
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const autogrow = () => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
    }
  };
  useEffect(autogrow, [tab]);

  return (
    <form action={action} className="mx-auto max-w-3xl">
      <input type="hidden" name="id" value={post?.id ?? ""} />
      {/* Default submit: Enter in a single-line field saves with the current status
       * (and keeps implicit submission away from the Delete button). */}
      <button type="submit" name="status" value={status} className="hidden" tabIndex={-1} aria-hidden />

      {/* Toolbar — pinned just below the app topbar (h-14). */}
      <div className="sticky top-14 z-10 -mx-2 flex flex-wrap items-center gap-2 border-b bg-background/95 px-2 py-2.5 backdrop-blur">
        <Link
          href="/content"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Content
        </Link>
        <StatusBadge status={status} />
        {state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state.ok && !state.error ? (
          <span className="text-sm text-emerald-600">{status === "published" ? "Published" : "Saved"}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(["write", "preview"] as const).map((t) => (
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
          {post ? (
            <button
              type="submit"
              formAction={deleteBlogPost}
              onClick={(e) => {
                if (!confirm("Delete this post? This can't be undone.")) e.preventDefault();
              }}
              aria-label="Delete post"
              className="rounded-md border px-2 py-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          <SaveButton
            value="draft"
            variant="outline"
            label={status === "published" ? "Unpublish" : "Save draft"}
          />
          <SaveButton
            value="published"
            variant="primary"
            label={status === "published" ? "Save changes" : "Publish"}
          />
        </div>
      </div>

      {/* The document */}
      <div className={cn("pt-8", tab === "preview" && "hidden")}>
        <input
          name="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          required
          placeholder="Untitled post"
          className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
        />
        <input
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a short description…"
          className="mt-2 w-full border-0 bg-transparent text-base text-muted-foreground outline-none placeholder:text-muted-foreground/40"
        />

        {/* Properties — quiet, Notion-style */}
        <div className="mt-6 grid gap-x-6 gap-y-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Slug</span>
            <input
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
              placeholder="my-post"
              className={cn(prop, "font-mono text-xs")}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Category</span>
            <select name="category" defaultValue={post?.category ?? "Company"} className={prop}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Author</span>
            <input name="author" defaultValue={post?.author ?? "rootmail"} className={prop} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0" title="Curated link posts point at an external article">
              External URL
            </span>
            <input
              name="external_url"
              type="url"
              defaultValue={post?.external_url ?? ""}
              placeholder="https:// (optional)"
              className={prop}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-20 shrink-0">Link source</span>
            <input name="source" defaultValue={post?.source ?? ""} placeholder="example.com" className={prop} />
          </label>
        </div>

        <textarea
          ref={bodyRef}
          name="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            autogrow();
          }}
          placeholder={"Write in markdown — # headings, **bold**, lists, code…"}
          className="mt-8 w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      {tab === "preview" ? (
        <article className="pt-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {(post?.category ?? "Company") + " · how it appears on the site"}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{title || "Untitled"}</h1>
          {description ? <p className="mt-2 text-lg text-muted-foreground">{description}</p> : null}
          <div className="mt-8">
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing to preview yet — switch to Write, or this is a curated link post.
              </p>
            )}
          </div>
        </article>
      ) : null}
    </form>
  );
}

function SaveButton({
  value,
  label,
  variant,
}: {
  value: CmsStatus;
  label: string;
  variant: "primary" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="status"
      value={value}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border hover:bg-accent",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {label}
    </button>
  );
}
