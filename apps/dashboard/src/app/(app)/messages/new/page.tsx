import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { SendForm } from "./send-form";

export default async function NewMessagePage() {
  let tenants: SubTenant[] = [];
  let templates: { slug: string; name: string }[] = [];
  try {
    const [t, tpl] = await Promise.all([api.listSubTenants(), api.listTemplates()]);
    tenants = t.data;
    templates = tpl.data.map((x) => ({ slug: x.slug, name: x.name }));
  } catch {
    /* compose still works without either list */
  }

  return (
    <>
      <PageHeader
        title="Send an email"
        description="Written and delivered like a normal email — suppression checked, rendered, tracked."
        backHref="/messages"
        backLabel="Messages"
      />
      <SendForm tenants={tenants} templates={templates} />
    </>
  );
}
