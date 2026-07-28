import { PageHeader } from "@/components/app/page-header";
import { studioContext } from "../studio-context";
import { TemplateEditor } from "../template-editor";

export default async function NewTemplatePage() {
  const ctx = await studioContext();
  return (
    <>
      <PageHeader
        title="New template"
        description="Pick a starting point, make it yours, then see exactly what lands in their inbox."
        backHref="/templates"
        backLabel="Templates"
      />
      <TemplateEditor {...ctx} />
    </>
  );
}
