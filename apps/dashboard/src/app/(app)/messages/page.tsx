import { Fragment } from "react";
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

/**
 * The filters, grouped by what they MEAN rather than listed by enum order.
 *
 * All nine used to render as identical round pills, so a bounce and a delivery
 * were the same visual object and the one filter an operator urgently needs —
 * "what went wrong" — was the sixth from the left, looking like the other
 * eight. Colour asserts state in this system or it is ink, and these are
 * states: the four that stopped are drawn stopped.
 */
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

/** The four that ended. Everything else is still on its way, or arrived. */
const STOPPED = new Set(["bounced", "complained", "failed", "suppressed"]);

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
        title="Mail"
        description="Every email that leaves your account — one-to-one sends, campaign mail, sequence steps — each with its recipient and full delivery story."
        actions={
          <Link href="/messages/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" /> Write
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s, i) => (
          <Fragment key={s}>
            {/* A rule where the meaning changes: everything to the left is mail
                that is arriving or has arrived; everything to the right stopped. */}
            {STOPPED.has(s) && !STOPPED.has(STATUSES[i - 1] ?? "all") ? (
              <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
            ) : null}
            <Link
              href={s === "all" ? "/messages" : `/messages?status=${s}`}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors duration-interaction ease-interaction",
                active === s
                  ? STOPPED.has(s)
                    ? "border-stopped bg-stopped-tint text-stopped"
                    : "border-ink bg-secondary text-foreground"
                  : STOPPED.has(s)
                    ? "border-stopped/30 text-stopped hover:border-stopped"
                    : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </Link>
          </Fragment>
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
          title={active === "all" ? "Nothing has left yet" : `Nothing is ${active} right now`}
          description={
            active === "all"
              ? "The first message you send appears here within seconds — from here, from a campaign, from a sequence, or straight through the API — and keeps its full record for as long as your retention window."
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
