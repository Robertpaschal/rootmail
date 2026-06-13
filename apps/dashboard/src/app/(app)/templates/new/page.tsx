import { PageHeader } from "@/components/app/page-header";
import { TemplateEditor } from "../template-editor";

export default function NewTemplatePage() {
  return (
    <>
      <PageHeader
        title="New template"
        description="Compose once, reuse everywhere. Use {{variables}} for per-send values."
        backHref="/templates"
        backLabel="Templates"
      />
      <TemplateEditor />
    </>
  );
}
