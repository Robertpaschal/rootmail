import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";
import { InboxView } from "./inbox-view";

// The Replies inbox as an email client: one entry per contact, and inside it
// their subject-threads — a new subject is a new thread, every reply stays on
// the thread it answers, and each entry renders as the full email it is.
export default async function InboxPage() {
  let threads: Thread[] = [];
  let failed: string | null = null;
  let isApiErr = false;
  try {
    threads = (await api.listThreads()).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  // Preload the first contact's threads (messages included) so the pane opens full.
  const firstContact = threads[0]?.contact_email ?? null;
  const firstIds = firstContact
    ? threads.filter((t) => t.contact_email === firstContact).slice(0, 6).map((t) => t.id)
    : [];
  const initialDetails = (
    await Promise.all(firstIds.map((id) => api.getThread(id).catch(() => null)))
  ).filter((t): t is Thread => t != null);

  return (
    <>
      <PageHeader
        title="Replies"
        description="Every send opens a thread under its contact — one per subject, replies attached where they belong."
      />
      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : (
        <InboxView threads={threads} initialDetails={initialDetails} initialContact={firstContact} />
      )}
    </>
  );
}
