import { notFound } from "next/navigation";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Template, TestRecipient } from "@/lib/types";
import { TemplateEditor } from "../template-editor";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let template: Template;
  try {
    template = await api.getTemplate(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Template" backHref="/templates" backLabel="Templates" />
        <ConnectionErrorCard
          message={
            err instanceof ConnectionError || err instanceof ApiError
              ? err.message
              : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  // "Send a test" from inside the studio — a real send to your own inbox.
  const [tr, me] = await Promise.all([
    api.listTestRecipients().catch(() => ({ data: [] as TestRecipient[] })),
    api.me().catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        title={template.name}
        description={`Slug: ${template.slug}`}
        backHref="/templates"
        backLabel="Templates"
      />
      <TemplateEditor template={template} testRecipients={tr.data} myEmail={me?.user.email ?? null} />
    </>
  );
}
