import { redirect } from "next/navigation";
import { DOCS_HOME } from "@rootmail/docs";

// /docs → the first page (Quickstart).
export default function DocsIndex() {
  redirect(`/docs/${DOCS_HOME}`);
}
