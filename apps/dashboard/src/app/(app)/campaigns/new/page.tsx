import type { Metadata } from "next";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import { CampaignComposer, type ComposerList, type ComposerTemplate } from "../composer";

export const metadata: Metadata = { title: "New campaign" };

// The campaign composer: where the marketing wing converges — audience (+ tag
// segment), the designed template, and tag-targeted A/B variants, in one flow.
export default async function NewCampaignPage() {
  let lists: ComposerList[] = [];
  let templates: ComposerTemplate[] = [];
  let sendsFrom: string | null = null;
  let locked: FeatureLockedInfo | null = null;
  let failed: string | null = null;
  let isApiErr = false;

  try {
    // The campaigns endpoint is the gated one — probe it first so a locked page
    // sells the tier instead of erroring.
    await api.listCampaigns();
    lists = (await api.listLists()).data.map((l) => ({ id: l.id, name: l.name, contacts: l.contacts }));
    // Marketing templates first — that's what campaigns send — then the rest.
    templates = (await api.listTemplates()).data
      .sort((a, b) => (a.type === b.type ? 0 : a.type === "marketing" ? -1 : 1))
      .map((t) => ({ id: t.id, name: t.name, subject: t.subject, type: t.type }));
    // The verified default address the campaign will send FROM (so it's explicit
    // that mail goes out as the customer, not rootmail).
    const senders = (await api.listSenders().catch(() => ({ data: [] }))).data;
    const sender = senders.find((s) => s.status === "verified" && s.is_default) ?? senders.find((s) => s.status === "verified");
    sendsFrom = sender ? (sender.display_name ? `${sender.display_name} <${sender.email}>` : sender.email) : null;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else failed = "An unexpected error occurred.";
  }

  if (locked) {
    return (
      <>
        <PageHeader title="New campaign" backHref="/campaigns" backLabel="Campaigns" />
        <FeatureLocked info={locked} blurb="Campaigns send a designed email to a whole audience in one go — with tag segments and A/B variants." />
      </>
    );
  }

  if (failed) {
    return (
      <>
        <PageHeader title="New campaign" backHref="/campaigns" backLabel="Campaigns" />
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Pick who it goes to and what they get — then review and send."
        backHref="/campaigns"
        backLabel="Campaigns"
      />
      <CampaignComposer lists={lists} templates={templates} sendsFrom={sendsFrom} />
    </>
  );
}
