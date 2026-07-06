import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { SendForm, type ComposeTemplate } from "./send-form";

export default async function NewMessagePage() {
  let tenants: SubTenant[] = [];
  let templates: ComposeTemplate[] = [];
  try {
    const [t, tpl] = await Promise.all([api.listSubTenants(), api.listTemplates()]);
    tenants = t.data;
    templates = tpl.data.map((x) => ({
      slug: x.slug,
      name: x.name,
      subject: x.subject,
      html: x.html,
    }));
  } catch {
    /* compose still works without either list */
  }

  return (
    <>
      <PageHeader
        title="New email"
        description="Write it, see it, send it — the preview shows exactly what your recipient gets."
        backHref="/messages"
        backLabel="Messages"
      />
      <SendForm tenants={tenants} templates={templates} />
    </>
  );
}
