import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Asset } from "@/lib/types";
import { AssetLibrary } from "./asset-library";

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let failed: string | null = null;
  let isApiErr = false;
  try {
    assets = (await api.listAssets()).data;
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
        title="Assets"
        description="Images and files you can embed in templates and emails."
      />
      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : (
        <AssetLibrary initial={assets} />
      )}
    </>
  );
}
