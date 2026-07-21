"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, GripVertical, Loader2 } from "lucide-react";
import { moveStageAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
import { CONTACT_STAGES, STAGE_META, type ContactStage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";

// The lifecycle board — a CRM kanban over the same people as the table. Drag a
// card between columns to escalate/de-escalate (or use the card's move menu);
// click a card to open the full profile. Columns cap what they render and hand
// off to the table view for the long tail, so it stays fast at any size.

function initials(name: string | null, email: string): string {
  const base = (name ?? email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export interface BoardColumn {
  stage: ContactStage;
  count: number;
  contacts: Contact[];
}

export function CrmBoard({ columns }: { columns: BoardColumn[] }) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ContactStage | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const move = (contactId: string, stage: ContactStage, fromStage: ContactStage) => {
    if (stage === fromStage) return;
    setError(null);
    setMovingId(contactId);
    start(async () => {
      const res = await moveStageAction(contactId, stage);
      if (res.error) setError(res.error);
      setMovingId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {columns.map((col) => {
          const meta = STAGE_META[col.stage];
          const isOver = overStage === col.stage;
          return (
            <div
              key={col.stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const [id, from] = (e.dataTransfer.getData("text/plain") ?? "").split("|");
                if (id) move(id, col.stage, from as ContactStage);
              }}
              className={cn(
                "flex min-h-64 flex-col rounded-xl border border-t-2 bg-card transition-colors",
                meta.column,
                isOver && "border-primary bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className={cn("size-2 rounded-full", meta.dot)} /> {meta.label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{col.count.toLocaleString()}</span>
              </div>

              <div className="flex-1 space-y-2 px-2 pb-2">
                {col.contacts.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `${c.id}|${col.stage}`);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "group rounded-lg border bg-background p-2.5 shadow-sm transition-opacity",
                      dragId === c.id && "opacity-50",
                      movingId === c.id && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
                      <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                            {initials(c.name, c.email)}
                          </span>
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-medium leading-tight group-hover:underline">
                              {c.name ?? c.email}
                            </span>
                            {c.name ? <span className="mt-0.5 block break-all text-[11px] leading-tight text-muted-foreground">{c.email}</span> : null}
                          </span>
                        </span>
                      </Link>
                      {movingId === c.id ? <Loader2 className="mt-1 size-3.5 animate-spin text-muted-foreground" /> : null}
                    </div>

                    {c.tags.length || c.status !== "active" ? (
                      <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                        {c.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="font-mono text-[9px]">{t}</Badge>
                        ))}
                        {c.status !== "active" ? (
                          <Badge variant="secondary" className="text-[9px] text-muted-foreground">{c.status}</Badge>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Current stage — always shown — and the change menu behind it. */}
                    <div className="mt-2 flex items-center justify-between gap-2 pl-5">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuId((id) => (id === c.id ? null : c.id))}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent",
                            STAGE_META[c.stage].badge,
                          )}
                          aria-label={`Stage: ${STAGE_META[c.stage].label}. Change stage`}
                        >
                          <span className={cn("size-1.5 rounded-full", STAGE_META[c.stage].dot)} />
                          {STAGE_META[c.stage].label}
                          <ChevronDown className="size-3 opacity-60" />
                        </button>
                        <AnimatePresence>
                          {menuId === c.id ? (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute left-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
                              >
                                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Move to stage</p>
                                {CONTACT_STAGES.map((s) => {
                                  const isCurrent = s === c.stage;
                                  return (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => {
                                        setMenuId(null);
                                        if (!isCurrent) move(c.id, s, c.stage);
                                      }}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent",
                                        isCurrent && "bg-accent/60",
                                      )}
                                    >
                                      <span className={cn("size-2 rounded-full", STAGE_META[s].dot)} />
                                      <span className="flex-1">{STAGE_META[s].label}</span>
                                      {isCurrent ? <Check className="size-3.5 text-primary" /> : null}
                                    </button>
                                  );
                                })}
                              </motion.div>
                            </>
                          ) : null}
                        </AnimatePresence>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(c.updated_at)}</span>
                    </div>
                  </div>
                ))}

                {col.contacts.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">{meta.hint}</p>
                ) : null}

                {col.count > col.contacts.length ? (
                  <Link
                    href={`/contacts?stage=${col.stage}`}
                    className="block rounded-md border border-dashed px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    View all {col.count.toLocaleString()} in the table
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Drag someone between columns as the relationship changes — every move lands on their timeline.
      </p>
    </div>
  );
}
