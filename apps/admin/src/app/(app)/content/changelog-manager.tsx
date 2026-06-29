"use client";

import { type ReactNode, useActionState, useState } from "react";
import { deleteChangelogEntry, saveChangelogEntry, type CmsState } from "./actions";
import type { AdminChangelogEntry, ChangeItem, ChangeKind } from "@/lib/types";

const KINDS: ChangeKind[] = ["New", "Improved", "Fixed"];
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
  const [state, action, pending] = useActionState<CmsState, FormData>(saveChangelogEntry, {});

  function startEdit(e: AdminChangelogEntry) {
    setEditing(e);
    setChanges(e.changes.length ? e.changes.map((c) => ({ ...c })) : [{ kind: "New", text: "" }]);
  }
  function startNew() {
    setEditing(null);
    setChanges([{ kind: "New", text: "" }]);
  }
  const setRow = (i: number, patch: Partial<ChangeItem>) =>
    setChanges((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addRow = () => setChanges((cs) => [...cs, { kind: "New", text: "" }]);
  const removeRow = (i: number) =>
    setChanges((cs) => (cs.length > 1 ? cs.filter((_, j) => j !== i) : cs));

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

        {/* Create / edit form */}
        <form key={editing?.id ?? "new"} action={action} className="space-y-3">
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <p className="text-sm font-medium">{editing ? "Edit entry" : "New entry"}</p>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Title">
              <input name="title" defaultValue={editing?.title ?? ""} required className={field} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={editing?.status ?? "draft"} className={field}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
          </div>
          <Field label="Date (optional — defaults to today)">
            <input type="date" name="date" defaultValue={editing?.date ? editing.date.slice(0, 10) : ""} className={field} />
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
      </div>
    </section>
  );
}
