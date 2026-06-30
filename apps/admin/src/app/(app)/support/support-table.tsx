"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
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
import type { SupportTicketListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const STATUSES = ["all", "open", "closed"] as const;
type SortKey = "from" | "organization" | "status" | "last_message_at";

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SupportTable({ tickets }: { tickets: SupportTicketListItem[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "last_message_at", dir: "desc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = tickets.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!needle) return true;
      return (
        (t.name ?? "").toLowerCase().includes(needle) ||
        t.email.toLowerCase().includes(needle) ||
        (t.organization_name ?? "").toLowerCase().includes(needle) ||
        (t.subject ?? "").toLowerCase().includes(needle) ||
        (t.last_message?.body ?? "").toLowerCase().includes(needle)
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "from":
          return (a.name || a.email).localeCompare(b.name || b.email) * dir;
        case "organization":
          return (a.organization_name ?? "~").localeCompare(b.organization_name ?? "~") * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "last_message_at":
          return a.last_message_at.localeCompare(b.last_message_at) * dir;
      }
    });
  }, [tickets, q, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  function sortBy(key: SortKey) {
    setPage(1);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "last_message_at" ? "desc" : "asc" },
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
          placeholder="Search sender, org, or message…"
          className="h-9 max-w-xs"
        />
        <div className="flex items-center gap-0.5 rounded-md border p-0.5 text-sm">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPage(1);
                setStatus(s);
              }}
              className={cn(
                "rounded px-2.5 py-1 capitalize transition-colors",
                status === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "ticket" : "tickets"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="From" k="from" sort={sort} onSort={sortBy} />
              <SortHead label="Organization" k="organization" sort={sort} onSort={sortBy} />
              <TableHead>Latest message</TableHead>
              <SortHead label="Status" k="status" sort={sort} onSort={sortBy} />
              <SortHead label="Updated" k="last_message_at" sort={sort} onSort={sortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={LifeBuoy}
                    title={tickets.length === 0 ? "No support tickets" : "No matching tickets"}
                    description={
                      tickets.length === 0
                        ? "When a customer reaches out from their dashboard, the conversation lands here — your reply is emailed back to them."
                        : "Try a different search or status filter."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="align-top">
                    <Link href={`/support/${t.id}`} className="block font-medium hover:underline">
                      {t.name || t.email}
                    </Link>
                    <span className="text-xs text-muted-foreground">{t.email}</span>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">{t.organization_name ?? "—"}</TableCell>
                  <TableCell className="max-w-sm align-top">
                    <Link href={`/support/${t.id}`} className="block truncate text-muted-foreground hover:underline">
                      {t.last_message
                        ? `${t.last_message.author === "staff" ? "You: " : ""}${t.last_message.body}`
                        : t.subject ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={t.status === "open" ? "secondary" : "muted"}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                    {ago(t.last_message_at)}
                  </TableCell>
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
