import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { ApiKey, SubTenant } from "@/lib/types";
import { ApiKeysManager } from "./api-keys-manager";

export default async function ApiKeysPage() {
  let keys: ApiKey[] | null = null;
  let failed: string | null = null;
  let errStatus: number | undefined;
  // Clients are what a key can be pinned to. Best-effort: a workspace without the
  // sub-tenancy feature gets a 402 here, which must NOT take the keys page down —
  // it just means there are no clients to scope to.
  let clients: SubTenant[] = [];
  try {
    clients = (await api.listSubTenants()).data;
  } catch {
    clients = [];
  }
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
        <ApiKeysManager keys={keys ?? []} currentKey={null} clients={clients} />
      )}
    </>
  );
}
