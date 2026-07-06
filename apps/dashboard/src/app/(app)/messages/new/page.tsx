import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { SubTenant } from "@/lib/types";
import { SendForm, type ComposeTemplate } from "./send-form";

export default async function NewMessagePage() {
  let tenants: SubTenant[] = [];
  let templates: ComposeTemplate[] = [];
  let senders: { email: string; display_name: string | null }[] = [];
  try {
    const [t, tpl, sn] = await Promise.all([
      api.listSubTenants(),
      api.listTemplates(),
      api.listSenders().catch(() => ({ data: [] })),
    ]);
    tenants = t.data;
    templates = tpl.data.map((x) => ({
      slug: x.slug,
      name: x.name,
      subject: x.subject,
      html: x.html,
    }));
    senders = sn.data
      .filter((s) => s.status === "verified")
      .map((s) => ({ email: s.email, display_name: s.display_name }));
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
      <SendForm tenants={tenants} templates={templates} senders={senders} />
    </>
  );
}
