import { notFound } from "next/navigation";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";
import { InboxView } from "../inbox-view";

// Deep-link into one conversation (e.g. from a contact or a campaign): the same
// email-client view with that exact subject open, including on mobile.
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
          status={err instanceof ApiError ? err.status : undefined}
        />
      </>
    );
  }

  const threads = await api
    .listThreads()
    .then((r) => r.data)
    .catch(() => [convo]);
  // The linked conversation may be older than the first list page. It still
  // belongs in the view; fetching it above already enforced workspace scope.
  if (!threads.some((thread) => thread.id === convo.id)) threads.push(convo);

  return (
    <>
      <PageHeader
        title="Replies"
        description="Every send opens a thread under its contact — one per subject, replies attached where they belong."
      />
      <InboxView key={convo.id} threads={threads} initialDetails={[convo]} initialContact={convo.contact_email} initialThreadId={convo.id} />
    </>
  );
}
