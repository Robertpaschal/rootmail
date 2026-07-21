import { PageHeader } from "@/components/app/page-header";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { ApiError, api } from "@/lib/rootmail";
import { SequenceBuilder } from "../builder";

export default async function NewSequencePage() {
  let templates: { slug: string; name: string }[] = [];
  let locked: FeatureLockedInfo | null = null;
  try {
    // Sequences are a Growth feature — probe entitlement BEFORE showing the
    // builder, so no entry path (grow-audience CTA, ⌘K, a shared/direct URL)
    // leads a free org into a composer that can only 402 on submit. The gate is
    // the same one the API enforces; the destination is walled no matter the door.
    await api.listSequences();
    templates = (await api.listTemplates()).data.map((t) => ({ slug: t.slug, name: t.name }));
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    /* other errors: the builder still works; the template picker is just empty */
  }

  if (locked) {
    return (
      <>
        <PageHeader title="New sequence" backHref="/sequences" backLabel="Sequences" />
        <FeatureLocked info={locked} blurb="Sequences drip a series of timed, event-driven emails to your contacts automatically — welcome, onboard, and follow up without lifting a finger." />
      </>
    );
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
