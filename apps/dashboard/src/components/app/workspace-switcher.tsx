"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workspace, WorkspaceLimit } from "@/lib/types";
import { createWorkspace, deleteWorkspace, renameWorkspace, switchWorkspace } from "./workspace-actions";

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  limit,
}: {
  workspaces: Workspace[];
  activeId: string | null;
  limit: WorkspaceLimit | null;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null;
  const canCreate = limit?.can_create ?? false;
  const unlimited = (limit?.capacity ?? -1) === -1;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function reset() {
    setOpen(false);
    setCreating(false);
    setName("");
    setError(null);
    setEditingId(null);
    setEditValue("");
  }

  function onSwitch(id: string) {
    if (id === active?.id) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await switchWorkspace(id);
      if (res.error) setError(res.error);
      else reset();
    });
  }

  function onCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createWorkspace(name);
      if (res.error) setError(res.error);
      else reset();
    });
  }

  function startRename(w: Workspace) {
    setEditingId(w.id);
    setEditValue(w.name);
    setError(null);
  }
  function cancelRename() {
    setEditingId(null);
    setEditValue("");
  }
  function commitRename(w: Workspace) {
    const next = editValue.trim();
    if (!next || next === w.name) {
      cancelRename();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await renameWorkspace(w.id, next);
      if (res.error) setError(res.error);
      else cancelRename();
    });
  }

  function onDelete(w: Workspace) {
    if (
      !window.confirm(
        `Delete "${w.name}" and ALL its data (messages, contacts, templates…)? This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteWorkspace(w.id);
      if (res.error) setError(res.error);
      else reset();
    });
  }

  // The sandbox and your only live workspace can't be deleted (the API enforces this too).
  const liveCount = workspaces.filter((w) => w.environment === "live").length;
  const canDelete = (w: Workspace) => w.environment !== "test" && liveCount > 1;

  if (!active) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        title="Switch workspace"
      >
        <span className="truncate">{active.name}</span>
        {active.environment === "test" ? (
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
            test
          </span>
        ) : null}
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-1.5 w-64 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Workspaces
          </div>
          <ul className="max-h-64 overflow-y-auto px-1 pb-1">
            {workspaces.map((w) => (
              <li key={w.id} className="group flex items-center gap-0.5">
                {editingId === w.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1">
                    <input
                      autoFocus
                      value={editValue}
                      maxLength={120}
                      disabled={pending}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(w);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation(); // don't also close the menu
                          cancelRename();
                        }
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => commitRename(w)}
                      title="Save"
                      aria-label="Save name"
                      className="shrink-0 rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={cancelRename}
                      title="Cancel"
                      aria-label="Cancel rename"
                      className="shrink-0 rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pending}
                      onClick={() => onSwitch(w.id)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-60",
                        w.id === active.id && "bg-accent/60",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{w.name}</span>
                        {w.environment === "test" ? (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                            test
                          </span>
                        ) : null}
                      </span>
                      {w.id === active.id ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startRename(w)}
                      title="Rename"
                      aria-label={`Rename ${w.name}`}
                      className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {canDelete(w) ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(w)}
                        title="Delete"
                        aria-label={`Delete ${w.name}`}
                        className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t p-1">
            {creating ? (
              <div className="space-y-2 p-2">
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="Workspace name"
                  maxLength={120}
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || !name.trim()}
                    onClick={onCreate}
                    className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pending ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setCreating(false);
                      setName("");
                      setError(null);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : canCreate ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Plus className="size-4 text-muted-foreground" /> Create workspace
              </button>
            ) : (
              <Link
                href="/billing?tab=plans"
                onClick={reset}
                className="flex flex-col gap-0.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="font-medium text-foreground">At workspace limit</span>
                <span className="text-xs text-muted-foreground">
                  Upgrade your plan or add a workspace pack →
                </span>
              </Link>
            )}
            {!unlimited && limit ? (
              <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
                {limit.used} of {limit.capacity} used
              </p>
            ) : null}
            {error ? <p className="px-2 pb-1 text-[11px] text-destructive">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
