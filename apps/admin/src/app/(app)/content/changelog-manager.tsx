"use client";

import { type ReactNode, useActionState, useState } from "react";
import { deleteChangelogEntry, saveChangelogEntry, type CmsState } from "./actions";
import type { AdminChangelogEntry, ChangeItem, ChangeKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: ChangeKind[] = ["New", "Improved", "Fixed"];
const KIND_BADGE: Record<ChangeKind, string> = {
  New: "bg-green-500/15 text-green-600",
  Improved: "bg-blue-500/15 text-blue-600",
  Fixed: "bg-amber-500/15 text-amber-600",
};
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

export function ChangelogManager({ entries }: { entries: AdminChangelogEntry[] }) {
  const [editing, setEditing] = useState<AdminChangelogEntry | null>(null);
  const [changes, setChanges] = useState<ChangeItem[]>([{ kind: "New", text: "" }]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [state, action, pending] = useActionState<CmsState, FormData>(saveChangelogEntry, {});

  function startEdit(e: AdminChangelogEntry) {
    setEditing(e);
    setTitle(e.title);
    setDate(e.date ? e.date.slice(0, 10) : "");
    setChanges(e.changes.length ? e.changes.map((c) => ({ ...c })) : [{ kind: "New", text: "" }]);
    setTab("edit");
  }
  function startNew() {
    setEditing(null);
    setTitle("");
    setDate("");
    setChanges([{ kind: "New", text: "" }]);
    setTab("edit");
  }
  const setRow = (i: number, patch: Partial<ChangeItem>) =>
    setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addRow = () => setChanges((cs) => [...cs, { kind: "New", text: "" }]);
  const removeRow = (i: number) =>
    setChanges((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs));

  const visibleChanges = changes.filter((c) => c.text.trim());

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-medium">Changelog</h2>
        <button
          type="button"
          onClick={startNew}
          className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          + New entry
        </button>
      </header>

      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1.2fr]">
        {/* List */}
        <ul className="space-y-1.5">
          {entries.length === 0 ? (
            <li className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No entries yet — create one on the right.
            </li>
          ) : (
            entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.date.slice(0, 10)} · {e.changes.length} change{e.changes.length === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusBadge status={e.status} />
                <button
                  type="button"
                  onClick={() => startEdit(e)}
                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  Edit
                </button>
                <form action={deleteChangelogEntry}>
                  <input type="hidden" name="id" value={e.id} />
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

        {/* Create / edit + preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{editing ? "Edit entry" : "New entry"}</p>
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

          <form action={action} className={cn("space-y-3", tab === "preview" && "hidden")}>
            <input type="hidden" name="id" value={editing?.id ?? ""} />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Title">
                <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={field} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={editing?.status ?? "draft"} className={field}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </Field>
            </div>
            <Field label="Date (optional — defaults to today)">
              <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </Field>

            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Changes</span>
              {changes.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    name="change_kind"
                    value={c.kind}
                    onChange={(e) => setRow(i, { kind: e.target.value as ChangeKind })}
                    className={`${field} w-28 shrink-0`}
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
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="Remove change"
                    className="shrink-0 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                + Add change
              </button>
            </div>

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            {state.ok ? <p className="text-sm text-green-600">Saved.</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : editing ? "Update entry" : "Create entry"}
            </button>
          </form>

          {tab === "preview" ? (
            <article className="rounded-md border p-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Preview · how it appears on the site
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-xl font-bold tracking-tight text-foreground">{title || "Untitled"}</h2>
                <span className="text-sm text-muted-foreground">{date || "Today"}</span>
              </div>
              <ul className="mt-4 space-y-2">
                {visibleChanges.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No changes added yet.</li>
                ) : (
                  visibleChanges.map((c, i) => (
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
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
