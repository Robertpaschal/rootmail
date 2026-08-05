import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Message, MessageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessagesTable } from "./messages-table";

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
  let errStatus: number | undefined;
  try {
    const res = await api.listMessages({
      limit: 100, // the API's validation cap (max 100 per request)
      status: active === "all" ? undefined : (active as MessageStatus),
    });
    messages = res.data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  // Resolve source names (campaign / sequence) so each row says WHERE the email
  // came from, not just its metering type. Best-effort — the table falls back to
  // a generic label if either lookup fails.
  const [cmpR, seqR] = await Promise.allSettled([api.listCampaigns(), api.listSequences()]);
  const campaignNames = Object.fromEntries(
    (cmpR.status === "fulfilled" ? cmpR.value.data : []).map((c) => [c.id, c.name]),
  );
  const sequenceNames = Object.fromEntries(
    (seqR.status === "fulfilled" ? seqR.value.data : []).map((s) => [s.id, s.name]),
  );

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every email that leaves your account — one-to-one sends, campaign mail, sequence steps — each with its recipient and full delivery story."
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
        <ConnectionErrorCard message={failed} status={errStatus} />
      ) : messages.length === 0 ? (
        /* "Send a test email" was the wrong first move to offer. This page is
           the record of real mail to real people; a product that opens by
           suggesting you fake it teaches you not to trust what you see here.
           Filtered-to-empty is a different situation from never-sent, and it
           needs a way back rather than a call to action. */
        <EmptyState
          icon={<Mail className="size-6" />}
          title={active === "all" ? "Nothing sent yet" : `No ${active} messages`}
          description={
            active === "all"
              ? "Every email you send — from here, from a campaign, from a sequence, or straight through the API — lands here with what happened to it: delivered, opened, clicked, bounced."
              : `Nothing here with that status right now. Everything you have sent is still under “All”.`
          }
          action={
            active === "all" ? (
              <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
                <Plus className="size-4" /> Write an email
              </Link>
            ) : (
              <Link href="/messages" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                Show all messages
              </Link>
            )
          }
        />
      ) : (
        <MessagesTable messages={messages} campaignNames={campaignNames} sequenceNames={sequenceNames} />
      )}
    </>
  );
}
