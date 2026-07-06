import Link from "next/link";
import { Inbox } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { ThreadStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";

export default async function InboxPage() {
  let threads: Thread[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  try {
    threads = (await api.listThreads()).data;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") {
      locked = asFeatureLocked(err.details);
    } else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  if (locked) {
    return (
      <>
        <PageHeader
          title="Replies"
          description="Every send opens a conversation. Replies are matched back here so nothing lands in a noreply void."
        />
        <FeatureLocked
          info={locked}
          blurb="The shared inbox threads every send and matches replies back automatically — no more noreply void."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Replies"
        description="Every send opens a conversation. Replies are matched back here so nothing lands in a noreply void."
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : threads && threads.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title="No conversations yet"
          description="Send a message and it'll open a thread here. Replies attach automatically."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(threads ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/inbox/${t.id}`} className="hover:underline">
                        {t.subject}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.contact_email}</TableCell>
                    <TableCell>
                      <ThreadStatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(t.last_message_at)}
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
