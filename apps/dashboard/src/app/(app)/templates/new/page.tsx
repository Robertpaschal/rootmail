import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import type { TestRecipient } from "@/lib/types";
import { TemplateEditor } from "../template-editor";

export default async function NewTemplatePage() {
  // "Send a test" needs somewhere safe to send: your own address, and the
  // reserved addresses that force a known outcome. Both degrade to nothing.
  const [tr, me] = await Promise.all([
    api.listTestRecipients().catch(() => ({ data: [] as TestRecipient[] })),
    api.me().catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title="New template"
        description="Start from a design, then make it yours. Use {{variables}} for per-send values."
        backHref="/templates"
        backLabel="Templates"
      />
      <TemplateEditor testRecipients={tr.data} myEmail={me?.user.email ?? null} />
    </>
  );
}
