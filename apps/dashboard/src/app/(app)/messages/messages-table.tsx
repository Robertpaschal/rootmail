"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { MessageFlow } from "@/components/app/message-flow";
import { Pager, SortHead, type Sort } from "@/components/app/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import type { Message } from "@/lib/types";

const PAGE_SIZE = 25;
type SortKey = "to" | "created_at";

/** Status is already filtered server-side (the chips); this adds search over
 * recipient/subject, sorting, and paging over the fetched window. */
export function MessagesTable({ messages }: { messages: Message[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = messages.filter(
      (m) =>
        !needle ||
        m.to.toLowerCase().includes(needle) ||
        (m.subject ?? "").toLowerCase().includes(needle),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) =>
      (sort.key === "to" ? a.to.localeCompare(b.to) : a.created_at.localeCompare(b.created_at)) * dir,
    );
  }, [messages, q, sort]);

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
          placeholder="Search recipient or subject…"
          className="h-9 max-w-xs"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} message{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <SortHead label="To" k="to" sort={sort} onSort={sortBy} />
                <TableHead>Subject</TableHead>
                <TableHead>Type</TableHead>
                <SortHead label="Created" k="created_at" sort={sort} onSort={sortBy} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <SearchX className="size-6 text-muted-foreground" />
                      <p className="text-sm font-medium">No matching messages</p>
                      <p className="text-sm text-muted-foreground">
                        Try a different search — or clear it to see everything fetched.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <MessageFlow message={m} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/messages/${m.id}`} className="hover:underline">
                        {m.to}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {m.subject}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{m.type}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(m.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
