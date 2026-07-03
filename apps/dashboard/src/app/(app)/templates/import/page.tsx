import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ImportTemplate } from "./import-template";

export const metadata: Metadata = { title: "Import template" };

export default function ImportTemplatePage() {
  return (
    <>
      <PageHeader
        title="Import a template"
        backHref="/templates"
        backLabel="Templates"
        description="Upload or paste HTML from anywhere — another provider, an agency file, your own build — preview it, and save it as a rootmail template."
      />
      <ImportTemplate />
    </>
  );
}
