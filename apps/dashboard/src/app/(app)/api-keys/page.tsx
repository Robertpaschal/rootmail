import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ApiKey } from "@/lib/types";
import { ApiKeysManager } from "./api-keys-manager";

export default async function ApiKeysPage() {
  let keys: ApiKey[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    keys = (await api.listApiKeys()).data;
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
        title="API keys"
        description="Authenticate the REST API and the @rootmail/node SDK. Treat these like passwords — the secret is shown only once."
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : (
        <ApiKeysManager keys={keys ?? []} currentKey={null} />
      )}
    </>
  );
}
