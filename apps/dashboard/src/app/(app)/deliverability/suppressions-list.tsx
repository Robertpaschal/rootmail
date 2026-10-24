import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/rootmail";
import type { Suppression, SuppressionsPage } from "@/lib/types";
import { rangeLabel, reasonLabel, suppressionsHref } from "@/lib/suppressions-view";

const PAGE_SIZE = 50;

// State colours describe what happened to an address, never a control (§10.2).
const reasonVariant: Record<Suppression["reason"], "destructive" | "warning" | "muted"> = {
  bounce: "destructive",
  complaint: "warning",
  unsubscribe: "muted",
  manual: "muted",
};

/**
 * Read-only list of the addresses this workspace (or the client being acted
 * as) will never send to. Same scope as the counts on this page — the API
 * applies the session's workspace and client scope; nothing here widens it.
 * No delete/unsuppress controls, deliberately.
 */
export async function SuppressionsList({ page, q }: { page: number; q?: string }) {
  let res: SuppressionsPage | null = null;
  try {
    res = await api.listSuppressions({ page, limit: PAGE_SIZE, q });
  } catch {
    res = null;
  }

  return (
    <Card id="suppressed" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Suppressed addresses</CardTitle>
        <form action="/deliverability#suppressed" method="get" className="flex items-center gap-2" role="search">
          <Input
            name="sup_q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Search by email"
            aria-label="Search suppressed addresses by email"
            className="h-8 w-56"
          />
          {q ? (
            <Link href={suppressionsHref(1)} className="text-xs text-brass-text hover:underline">
              Clear
            </Link>
          ) : null}
        </form>
      </CardHeader>
      <CardContent>
        {res === null ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the list right now. The counts above are unaffected.</p>
        ) : res.data.length === 0 && res.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            This page is past the end of the list.{" "}
            <Link href={suppressionsHref(1, q)} className="text-brass-text hover:underline">
              Back to the newest
            </Link>
          </p>
        ) : res.data.length === 0 ? (
          <EmptyState
            title={q ? `Nothing suppressed matches “${q}”` : "Every address here is still mailable"}
            description={
              q
                ? "Search matches any part of the email address."
                : "Addresses that hard-bounce, complain, unsubscribe or are imported land here, and every send to them is skipped."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Suppressed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {res.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[22rem] truncate font-medium">{s.email}</TableCell>
                    <TableCell>
                      <Badge variant={reasonVariant[s.reason] ?? "muted"}>{reasonLabel(s.reason)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.source ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      <time dateTime={s.created_at} title={s.created_at}>
                        {s.created_at.slice(0, 16).replace("T", " ")} UTC
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{rangeLabel(res.page, res.limit, res.data.length, res.total)}</span>
              <div className="flex gap-3">
                {res.page > 1 ? (
                  <Link href={suppressionsHref(res.page - 1, q)} className="text-brass-text hover:underline">
                    ← Newer
                  </Link>
                ) : null}
                {res.has_more ? (
                  <Link href={suppressionsHref(res.page + 1, q)} className="text-brass-text hover:underline">
                    Older →
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
