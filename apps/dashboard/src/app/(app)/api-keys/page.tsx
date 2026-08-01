import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ApiKey } from "@/lib/types";
import { ApiKeysManager } from "./api-keys-manager";

export default async function ApiKeysPage() {
  let keys: ApiKey[] | null = null;
  let failed: string | null = null;
  let errStatus: number | undefined;
  try {
    keys = (await api.listApiKeys()).data;
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
        title="API keys"
        description="For developers: authenticate the REST API, the @rootmail/node SDK, and the CLI. Everyday sending from the dashboard needs no key. Create one when you're ready to integrate — treat it like a password; the secret is shown only once."
      />

      {failed ? (
        <ConnectionErrorCard message={failed} status={errStatus} />
      ) : (
        <ApiKeysManager keys={keys ?? []} currentKey={null} />
      )}
    </>
  );
}
