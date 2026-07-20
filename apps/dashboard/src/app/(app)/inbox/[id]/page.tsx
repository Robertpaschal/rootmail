import { notFound } from "next/navigation";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";
import { InboxView } from "../inbox-view";

// Deep-link into one conversation (e.g. from a contact or a campaign): the same
// email-client view with that thread's contact selected.
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let convo: Thread;
  try {
    convo = await api.getThread(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Replies" backHref="/inbox" backLabel="Replies" />
        <ConnectionErrorCard
          message={err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."}
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const threads = await api
    .listThreads()
    .then((r) => r.data)
    .catch(() => [convo]);

  return (
    <>
      <PageHeader
        title="Replies"
        description="Every send opens a thread under its contact — one per subject, replies attached where they belong."
      />
      <InboxView threads={threads} initialDetails={[convo]} initialContact={convo.contact_email} />
    </>
  );
}
