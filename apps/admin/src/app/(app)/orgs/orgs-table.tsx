"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { Pager, SortHead, type Sort } from "@/components/app/data-table";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrgSummary } from "@/lib/types";

const PLANS = ["all", "free", "pro", "scale", "enterprise"] as const;
const PAGE_SIZE = 25;

function planVariant(plan: string): "muted" | "default" | "secondary" {
  if (plan === "free") return "muted";
  if (plan === "enterprise") return "default";
  return "secondary";
}

const PLAN_DOT: Record<string, string> = {
  free: "bg-slate-400",
  pro: "bg-blue-500",
  scale: "bg-violet-500",
  enterprise: "bg-amber-500",
};

type SortKey = "name" | "plan" | "members" | "usage_this_period" | "created_at";

export function OrgsTable({ orgs }: { orgs: OrgSummary[] }) {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<(typeof PLANS)[number]>("all");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = orgs.filter(
      (o) =>
        (plan === "all" || o.plan === plan) &&
        (!needle || o.name.toLowerCase().includes(needle) || o.slug.toLowerCase().includes(needle)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [orgs, q, plan, sort]);

  // Reset to page 1 whenever the result set changes shape.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  function sortBy(key: SortKey) {
    setPage(1);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => onFilterChange(setQ)(e.target.value)}
          placeholder="Search name or slug…"
          className="h-9 max-w-xs"
        />
        <div className="flex items-center gap-0.5 rounded-md border p-0.5 text-sm">
          {PLANS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onFilterChange(setPlan)(p)}
              className={cn(
                "rounded px-2.5 py-1 capitalize transition-colors",
                plan === p ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {orgs.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Name" k="name" sort={sort} onSort={sortBy} />
              <SortHead label="Plan" k="plan" sort={sort} onSort={sortBy} />
              <SortHead label="Members" k="members" sort={sort} onSort={sortBy} align="right" />
              <SortHead label="Emails (period)" k="usage_this_period" sort={sort} onSort={sortBy} align="right" />
              <SortHead label="Created" k="created_at" sort={sort} onSort={sortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Building2}
                    title={orgs.length === 0 ? "No organizations yet" : "No matching organizations"}
                    description={
                      orgs.length === 0
                        ? "Customer organizations appear here as soon as people sign up."
                        : "Try a different search or clear the plan filter."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orgs/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{o.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={planVariant(o.plan)} className="gap-1.5 capitalize">
                      <span className={cn("size-1.5 rounded-full", PLAN_DOT[o.plan] ?? "bg-current")} />
                      {o.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{o.members}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(o.usage_this_period)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pager
        start={start}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        page={current}
        pageCount={pageCount}
        onPage={setPage}
      />
    </div>
  );
}
