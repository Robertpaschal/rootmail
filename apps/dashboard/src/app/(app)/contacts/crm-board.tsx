"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2 } from "lucide-react";
import { moveStageAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";
import { CONTACT_STAGES, STAGE_META, type ContactStage } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";

// The lifecycle board — a CRM kanban over the same people as the table.
//
// ONE COLUMN AT A TIME. Five equal columns meant every stage paid the same rent
// whether it held forty people or nobody, so a board with one busy stage read as
// mostly empty gutters and the busy one was the narrowest useful thing on the
// page. The stage you are looking at now takes the width; the others stand aside
// as slim rails that still show their count and still accept a drop. It is the
// social-app pattern — the current view expands, the rest wait their turn — and
// framer's shared layout does the widening so it reads as one movement rather
// than a re-render.
//
// TEN AT A TIME inside that column, because a column you have to scroll for a
// minute is the same problem in a different direction.

const PER_PAGE = 10;
/** The rail width of a stage you are not looking at. */
const RAIL = 68;

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
  const reduce = useReducedMotion();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ContactStage | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // Open on the busiest stage — the one with something to look at — rather than
  // always the first, which is empty for any workspace past its first week.
  const busiest = useMemo(
    () => [...columns].sort((a, b) => b.count - a.count)[0]?.stage ?? CONTACT_STAGES[0],
    [columns],
  );
  const [focus, setFocus] = useState<ContactStage>(busiest);
  const [page, setPage] = useState(1);

  const focusOn = (s: ContactStage) => {
    setFocus(s);
    setPage(1); // a new column starts at its own beginning
  };

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

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.8 };

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* The instruction belongs where you are about to act, not underneath the
          thing it describes — you cannot follow it after you have scrolled past. */}
      <p className="text-center text-xs text-muted-foreground">
        Drag someone between columns as the relationship changes — every move lands on their timeline.
      </p>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {columns.map((col) => {
          const meta = STAGE_META[col.stage];
          const isOver = overStage === col.stage;
          const open = col.stage === focus;
          const pages = Math.max(1, Math.ceil(col.contacts.length / PER_PAGE));
          const shown = open
            ? col.contacts.slice((page - 1) * PER_PAGE, page * PER_PAGE)
            : [];

          return (
            <motion.div
              key={col.stage}
              layout
              transition={spring}
              style={{ flex: open ? "1 1 0%" : `0 0 ${RAIL}px` }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const [id, from] = (e.dataTransfer.getData("text/plain") ?? "").split("|");
                // Dropping onto a rail moves them AND opens that stage, so the
                // card you just moved is the first thing you see.
                if (id) {
                  move(id, col.stage, from as ContactStage);
                  focusOn(col.stage);
                }
              }}
              className={cn(
                "flex min-h-72 flex-col overflow-hidden rounded-xl border border-t-2 bg-card transition-colors",
                meta.column,
                isOver && "border-primary bg-primary/5",
                !open && "cursor-pointer hover:bg-accent/40",
              )}
              onClick={() => (open ? undefined : focusOn(col.stage))}
            >
              {open ? (
                <>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className={cn("size-2 rounded-full", meta.dot)} /> {meta.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {col.count.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2 px-2 pb-2">
                    <AnimatePresence initial={false} mode="popLayout">
                      {shown.map((c) => (
                        <motion.div
                          key={c.id}
                          layout
                          initial={reduce ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                        >
                        {/* The drag lives on a plain element: motion.div owns
                            onDragStart for its OWN gesture system, so the HTML5
                            handler would arrive typed as a pointer event and
                            never carry dataTransfer. Animation outside, drag
                            inside — each keeps its own contract. */}
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", `${c.id}|${col.stage}`);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(c.id);
                          }}
                          onDragEnd={() => setDragId(null)}
                          className={cn(
                            "group rounded-lg border bg-background p-2.5 shadow-sm",
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
                                  {c.name ? (
                                    <span className="mt-0.5 block break-all text-[11px] leading-tight text-muted-foreground">
                                      {c.email}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            </Link>
                            {movingId === c.id ? (
                              <Loader2 className="mt-1 size-3.5 animate-spin text-muted-foreground" />
                            ) : null}
                          </div>

                          {c.tags.length || c.status !== "active" ? (
                            <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                              {c.tags.slice(0, 3).map((t) => (
                                <Badge key={t} variant="secondary" className="font-mono text-[9px]">
                                  {t}
                                </Badge>
                              ))}
                              {c.status !== "active" ? (
                                <Badge variant="secondary" className="text-[9px] text-muted-foreground">
                                  {c.status}
                                </Badge>
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
                                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Move to stage
                                      </p>
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
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {relativeTime(c.updated_at)}
                            </span>
                          </div>
                        </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {col.contacts.length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                        {meta.hint}
                      </p>
                    ) : null}
                  </div>

                  {/* Ten at a time, then the table for anything past what we hold. */}
                  {pages > 1 ? (
                    <div className="flex items-center justify-center gap-2 border-t px-2 py-2 text-xs text-muted-foreground">
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage((n) => Math.max(1, n - 1))}
                        className="rounded-md border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <span className="tabular-nums">
                        {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, col.contacts.length)} of{" "}
                        {col.count.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        disabled={page === pages}
                        onClick={() => setPage((n) => Math.min(pages, n + 1))}
                        className="rounded-md border px-2 py-1 transition-colors hover:bg-accent disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  ) : null}

                  {col.count > col.contacts.length ? (
                    <Link
                      href={`/contacts?stage=${col.stage}`}
                      className="block border-t px-2 py-1.5 text-center text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      View all {col.count.toLocaleString()} in the table
                    </Link>
                  ) : null}
                </>
              ) : (
                /* A rail: enough to know what it is and how many are in it, and
                   still a legal place to drop someone. */
                <button
                  type="button"
                  className="flex flex-1 flex-col items-center gap-2 py-3"
                  aria-label={`Show ${meta.label} (${col.count})`}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
                  <span className="text-xs font-semibold tabular-nums">{col.count.toLocaleString()}</span>
                  <span
                    className="flex-1 text-[11px] font-medium text-muted-foreground"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {meta.label}
                  </span>
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
