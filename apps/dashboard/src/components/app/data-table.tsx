"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Shared building blocks for client-side tables (mirrors the admin console's
 * data-table): a sortable header cell and a prev/next pager. Each table owns its
 * own filter/sort/page state; these just render the controls. */

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

export function SortHead<K extends string>({
  label,
  k,
  sort,
  onSort,
  align,
}: {
  label: string;
  k: K;
  sort: Sort<K>;
  onSort: (k: K) => void;
  align?: "right";
}) {
  const active = sort.key === k;
  return (
    <TableHead scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(k)}
        aria-label={`Sort by ${label}${active ? `, currently ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm normal-case tracking-normal transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

/** Prev/Next pager with a range label. Renders nothing when it all fits on one page. */
export function Pager({
  start,
  pageSize,
  total,
  page,
  pageCount,
  onPage,
}: {
  start: number;
  pageSize: number;
  total: number;
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav aria-label="Table pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span aria-live="polite" className="text-muted-foreground">
        {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="min-h-10 rounded-md border px-3 py-2 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-muted-foreground">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="min-h-10 rounded-md border px-3 py-2 font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
