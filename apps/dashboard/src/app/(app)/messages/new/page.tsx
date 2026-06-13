import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { SendForm } from "./send-form";

export default async function NewMessagePage() {
  let tenants: SubTenant[] = [];
  try {
    tenants = (await api.listSubTenants()).data;
  } catch {
    tenants = [];
  }

  return (
    <>
      <PageHeader
        title="Send a test email"
        description="Push a message through the live pipeline — render, suppression, provider, audit."
        backHref="/messages"
        backLabel="Messages"
      />
      <SendForm tenants={tenants} />
    </>
  );
}
