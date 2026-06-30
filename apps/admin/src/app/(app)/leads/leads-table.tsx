"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Contact } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { Pager, SortHead, type Sort } from "@/components/app/data-table";
import { formatDate } from "@/lib/format";
import { LEAD_STATUS_LABEL, leadStatusVariant } from "@/lib/leads";
import { LEAD_STATUSES, type Lead } from "@/lib/types";

const PAGE_SIZE = 25;
type SortKey = "company" | "status" | "owner" | "created_at";

// Sort "Status" along the pipeline (new → … → lost), not alphabetically.
const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  LEAD_STATUSES.map((s, i) => [s, i]),
);

/** Rows are already status-filtered server-side; this adds search, sort and paging. */
export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = leads.filter(
      (l) =>
        !needle ||
        (l.company ?? "").toLowerCase().includes(needle) ||
        l.name.toLowerCase().includes(needle) ||
        l.email.toLowerCase().includes(needle),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "company":
          return (a.company || a.name).localeCompare(b.company || b.name) * dir;
        case "status":
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
        case "owner":
          return (a.owner_email ?? "~").localeCompare(b.owner_email ?? "~") * dir;
        case "created_at":
          return a.created_at.localeCompare(b.created_at) * dir;
      }
    });
  }, [leads, q, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  function sortBy(key: SortKey) {
    setPage(1);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "created_at" ? "desc" : "asc" },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search company, name, or email…"
          className="h-9 max-w-xs"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Company / Name" k="company" sort={sort} onSort={sortBy} />
              <TableHead>Email</TableHead>
              <SortHead label="Status" k="status" sort={sort} onSort={sortBy} />
              <SortHead label="Owner" k="owner" sort={sort} onSort={sortBy} />
              <SortHead label="Created" k="created_at" sort={sort} onSort={sortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={Contact}
                    title={leads.length === 0 ? "No leads in this view" : "No matching leads"}
                    description={
                      leads.length === 0
                        ? "Enterprise & custom-plan enquiries from the contact form land here, ready to work."
                        : "Try a different search term."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                      {l.company || l.name}
                    </Link>
                    {l.company ? <div className="text-xs text-muted-foreground">{l.name}</div> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.email}</TableCell>
                  <TableCell>
                    <Badge variant={leadStatusVariant(l.status)}>{LEAD_STATUS_LABEL[l.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.owner_email ?? <span className="text-muted-foreground/60">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(l.created_at)}</TableCell>
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
