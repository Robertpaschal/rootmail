import { PageHeader } from "@/components/app/page-header";
import { api } from "@/lib/rootmail";
import { SequenceBuilder } from "../builder";

export default async function NewSequencePage() {
  let templates: { slug: string; name: string }[] = [];
  try {
    templates = (await api.listTemplates()).data.map((t) => ({ slug: t.slug, name: t.name }));
  } catch {
    /* builder still works; the template picker is just empty */
  }

  return (
    <>
      <PageHeader
        title="New sequence"
        description="Add steps (wait / send / branch) and choose how contacts enroll."
        backHref="/sequences"
        backLabel="Sequences"
      />
      <SequenceBuilder templates={templates} />
    </>
  );
}
