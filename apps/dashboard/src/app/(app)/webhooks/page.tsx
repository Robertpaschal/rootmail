import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { WebhookEndpoint } from "@/lib/types";
import { WebhookConsole } from "./webhook-console";

export default async function WebhooksPage() {
  let endpoints: WebhookEndpoint[] = [];
  let failed: string | null = null;
  let errStatus: number | undefined;
  try {
    endpoints = (await api.listWebhooks()).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Get notified when message events happen — delivered, bounced, opened, and more."
      />
      {failed ? (
        <ConnectionErrorCard message={failed} status={errStatus} />
      ) : (
        <WebhookConsole initial={endpoints} />
      )}
    </>
  );
}
