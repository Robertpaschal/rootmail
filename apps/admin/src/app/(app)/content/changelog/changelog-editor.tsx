"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";
import type { AdminChangelogEntry, ChangeItem, ChangeKind, CmsStatus } from "@/lib/types";
import { deleteChangelogEntry, saveChangelogEntry, type CmsState } from "../actions";
import { StatusBadge } from "../status-badge";

const KINDS: ChangeKind[] = ["New", "Improved", "Fixed"];
const KIND_BADGE: Record<ChangeKind, string> = {
  New: "bg-green-500/15 text-green-600",
  Improved: "bg-blue-500/15 text-blue-600",
  Fixed: "bg-amber-500/15 text-amber-600",
};

/**
 * Full-page changelog editor, shaped for what a changelog is: a titled, dated list
 * of change lines you add one by one — with the live public version-card below as
 * you type. Draft until published, same as the blog.
 */
export function ChangelogEditor({ entry }: { entry: AdminChangelogEntry | null }) {
  const router = useRouter();
  const [state, action] = useActionState<CmsState, FormData>(saveChangelogEntry, {});
  const [status, setStatus] = useState<CmsStatus>(entry?.status ?? "draft");

  const [title, setTitle] = useState(entry?.title ?? "");
  const [date, setDate] = useState(entry?.date ? entry.date.slice(0, 10) : "");
  const [changes, setChanges] = useState<ChangeItem[]>(
    entry?.changes.length ? entry.changes.map((c) => ({ ...c })) : [{ kind: "New", text: "" }],
  );

  useEffect(() => {
    if (!state.ok) return;
    if (state.status) setStatus(state.status);
    if (!entry && state.id) router.replace(`/content/changelog/${state.id}`);
  }, [state, entry, router]);

  const setRow = (i: number, patch: Partial<ChangeItem>) =>
    setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addRow = () => setChanges((cs) => [...cs, { kind: "New", text: "" }]);
  const removeRow = (i: number) =>
    setChanges((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs));

  const visible = changes.filter((c) => c.text.trim());

  return (
    <form action={action} className="mx-auto max-w-3xl">
      <input type="hidden" name="id" value={entry?.id ?? ""} />
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
          {entry ? (
            <button
              type="submit"
              formAction={deleteChangelogEntry}
              onClick={(e) => {
                if (!confirm("Delete this changelog entry? This can't be undone.")) e.preventDefault();
              }}
              aria-label="Delete entry"
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
      <div className="pt-8">
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Untitled release"
          className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
        />
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            name="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-border focus:border-ring"
          />
          <span className="text-muted-foreground/60">blank = today</span>
        </label>

        <div className="mt-8 space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Changes</span>
          {changes.map((c, i) => (
            <div key={i} className="group flex items-center gap-2">
              <select
                name="change_kind"
                value={c.kind}
                onChange={(e) => setRow(i, { kind: e.target.value as ChangeKind })}
                className="w-28 shrink-0 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                name="change_text"
                value={c.text}
                onChange={(e) => setRow(i, { text: e.target.value })}
                placeholder="What changed…"
                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border focus:border-ring"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove change"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add change
          </button>
        </div>

        {/* Live preview of the public version card — always visible; a changelog is
         * short enough that write-and-see beats a mode toggle. */}
        <div className="mt-10 rounded-lg border p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Preview · how it appears on the site
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground">{title || "Untitled"}</h2>
            <span className="text-sm text-muted-foreground">{date || "Today"}</span>
          </div>
          <ul className="mt-4 space-y-2">
            {visible.length === 0 ? (
              <li className="text-sm text-muted-foreground">No changes added yet.</li>
            ) : (
              visible.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                      KIND_BADGE[c.kind],
                    )}
                  >
                    {c.kind}
                  </span>
                  <span className="text-muted-foreground">{c.text}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
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
