import { PageHeader } from "@/components/app/page-header";
import { studioContext } from "../studio-context";
import { TemplateEditor } from "../template-editor";

export default async function NewTemplatePage() {
  const ctx = await studioContext();
  return (
    <>
      <PageHeader
        title="Template studio"
        backHref="/templates"
        backLabel="Templates"
      />
      <TemplateEditor {...ctx} />
    </>
  );
}
