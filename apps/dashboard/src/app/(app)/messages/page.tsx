import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { MessageStatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message, MessageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES = [
  "all",
  "delivered",
  "sent",
  "queued",
  "sending",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = status && (STATUSES as readonly string[]).includes(status) ? status : "all";

  let messages: Message[] = [];
  let failed: string | null = null;
  let isApiErr = false;
  try {
    const res = await api.listMessages({
      limit: 50,
      status: active === "all" ? undefined : (active as MessageStatus),
    });
    messages = res.data;
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
        title="Messages"
        description="Every message sent through this workspace."
        actions={
          <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" /> Send
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/messages" : `/messages?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
              active === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </Link>
        ))}
      </div>

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<Mail className="size-6" />}
          title="No messages"
          description={
            active === "all"
              ? "Send your first message to see it here."
              : `No messages with status “${active}”.`
          }
          action={
            <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> Send a test email
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
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <MessageStatusBadge status={m.status} />
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
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
