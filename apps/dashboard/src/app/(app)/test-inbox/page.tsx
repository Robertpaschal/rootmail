import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { MessageStatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Test inbox" };

// The hosted test inbox: every sandbox send lands here with its full rendered
// content — no real mailbox needed to see exactly what a recipient would get.
// Sandbox mail is free, never leaves rootmail, and never touches reputation.
export default async function TestInboxPage() {
  let rows: Message[] = [];
  let failed: string | null = null;
  let isApiErr = false;
  try {
    rows = (await api.listMessages({ sandbox: true, limit: 100 })).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  return (
    <>
      <PageHeader
        title="Test inbox"
        description="Every sandbox send lands here with its rendered content — free, instant, and invisible to the outside world."
        actions={
          <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" /> Send a test
          </Link>
        }
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="size-6" />}
          title="Your test inbox is empty"
          description="Send with a test-mode key (or sandbox on) and the message appears here instantly — subject, HTML, text, the lot — without a real mailbox in sight."
          action={
            <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> Send your first test
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <MessageStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/messages/${m.id}`} className="hover:underline">
                        {m.to}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground">
                      <Link href={`/messages/${m.id}`} className="hover:underline">
                        {m.subject}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{m.type}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(m.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
