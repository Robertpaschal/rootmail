import { notFound } from "next/navigation";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ThreadStatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread, ThreadMessage } from "@/lib/types";
import { ReplyBox } from "../reply-box";

function Bubble({ m }: { m: ThreadMessage }) {
  const outbound = m.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%] space-y-1", outbound ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{outbound ? "You" : m.from}</span>
          <span>·</span>
          <span>{formatDateTime(m.created_at)}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl border px-4 py-2.5 text-sm",
            outbound ? "bg-primary/10" : "bg-card",
          )}
        >
          {m.body_text ? (
            <p className="whitespace-pre-wrap">{m.body_text}</p>
          ) : m.body_html ? (
            // sandbox="" strips scripts — safe to render the stored HTML.
            <iframe
              title="Message"
              sandbox=""
              srcDoc={m.body_html}
              className="h-44 w-full rounded-md border bg-white"
            />
          ) : (
            <p className="text-muted-foreground">(empty)</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let thread: Thread;
  try {
    thread = await api.getThread(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Conversation" backHref="/inbox" backLabel="Inbox" />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError
              ? err.message
              : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={thread.subject}
        description={`With ${thread.contact_email}`}
        backHref="/inbox"
        backLabel="Inbox"
        actions={<ThreadStatusBadge status={thread.status} />}
      />

      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="space-y-4 p-5">
            {(thread.messages ?? []).map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reply</CardTitle>
          </CardHeader>
          <CardContent>
            <ReplyBox threadId={thread.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
