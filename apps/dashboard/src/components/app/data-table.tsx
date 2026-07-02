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
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
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
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {start + 1}–{Math.min(start + pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-md border px-2.5 py-1 font-medium transition-colors hover:bg-accent disabled:opacity-40"
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
          className="rounded-md border px-2.5 py-1 font-medium transition-colors hover:bg-accent disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
