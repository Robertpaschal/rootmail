import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Thread } from "@/lib/types";
import { InboxView } from "./inbox-view";

// The Replies inbox — one conversation per contact, like a chat. Every send (a
// campaign, a drip, or a one-off) rolls into the recipient's space, and their
// replies land right back here.
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

  // Preload the most-recent conversation so the pane isn't empty on first paint.
  const initial = threads[0] ? await api.getThread(threads[0].id).catch(() => null) : null;

  return (
    <>
      <PageHeader
        title="Replies"
        description="Every send opens a conversation. Replies land here — one space per contact, like a chat."
      />
      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : (
        <InboxView threads={threads} initialConversation={initial} />
      )}
    </>
  );
}
