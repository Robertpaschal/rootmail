import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { LocalTime } from "@/components/app/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, api } from "@/lib/rootmail";
import type { Campaign, CampaignAnalytics, CampaignPreviewRecipient, CampaignRecipient } from "@/lib/types";
import { deleteCampaign, sendCampaign } from "../actions";
import { CampaignLive } from "./campaign-live";
import { PreFlight } from "./pre-flight";
import { FollowUp } from "./follow-up";
import { CampaignJourney, LaunchPanel, type Blocker } from "./launch";
import { phaseForStatus } from "../phase";

export const metadata: Metadata = { title: "Campaign" };

const STATUS_VARIANT: Record<Campaign["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  scheduled: "warning",
  sending: "warning",
  sent: "success",
};

// The campaign as a live record: what it is (facts) + what's happening across the
// whole audience (CampaignLive — status, funnel, per-recipient engagement, live).
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let campaign: Campaign;
  try {
    campaign = await api.getCampaign(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const notYetSent = campaign.status === "draft" || campaign.status === "scheduled";
  const [analytics, recipientsRes, sendersRes, sequencesRes, previewRes] = await Promise.all([
    api.campaignAnalytics(id).catch(() => null as CampaignAnalytics | null),
    api.campaignRecipients(id, { limit: 100 }).catch(() => ({ data: [] as CampaignRecipient[], total: 0 })),
    api.listSenders().catch(() => ({ data: [] })),
    api.listSequences().catch(() => ({ data: [] })),
    // Pre-flight only matters before it goes out — afterwards, the real messages
    // are the record and CampaignLive shows them.
    notYetSent
      ? api.campaignPreview(id, 25).catch(() => ({ data: [] as CampaignPreviewRecipient[], total: 0 }))
      : Promise.resolve({ data: [] as CampaignPreviewRecipient[], total: 0 }),
  ]);

  // The address the campaign sends from (and replies go to): its own, else the
  // org's default verified sender, else rootmail's.
  const def = sendersRes.data.find((s) => s.status === "verified" && s.is_default) ?? sendersRes.data.find((s) => s.status === "verified");
  const fromLabel =
    campaign.from_email ??
    (def ? (def.display_name ? `${def.display_name} <${def.email}>` : def.email) : "rootmail address (verify your own under Settings → Sending)");
  const replyLabel = def ? def.email : "rootmail — set up a verified address to receive replies yourself";

  // What still stands between this draft and a send. Each one is a real API
  // refusal we'd otherwise have swallowed; naming it here (with the door that
  // fixes it) is the difference between a dead button and a next step.
  const hasVerifiedSender = sendersRes.data.some((s) => s.status === "verified");
  const audienceSize = previewRes.total ?? previewRes.data.length;
  const blockers: Blocker[] = [];
  if (!campaign.list_id) {
    blockers.push({
      what: "No audience chosen — there's nobody to send to.",
      fixHref: "/contacts",
      fixLabel: "Pick an audience",
    });
  }
  if (!campaign.template_id && !campaign.subject) {
    blockers.push({
      what: "Nothing to send — this campaign has no content yet.",
      fixHref: `/campaigns/new?id=${campaign.id}`,
      fixLabel: "Write it",
    });
  }
  if (!hasVerifiedSender) {
    blockers.push({
      what: "No verified sending address — mail would go out from a rootmail address.",
      fixHref: "/settings/sender",
      fixLabel: "Verify yours",
    });
  }

  const facts: [string, string][] = [
    ["Subject", campaign.subject ?? "the template's subject"],
    ["From", fromLabel],
    ["Replies go to", replyLabel],
    ["Audience", campaign.segment_tag ? `contacts tagged “${campaign.segment_tag}”` : "everyone on the list"],
  ];

  return (
    <>
      <PageHeader
        title={campaign.name}
        backHref="/campaigns"
        backLabel="Campaigns"
        // Sending moved into the LaunchPanel below: it needs the audience count,
        // the readiness checks and a confirm step, none of which fit a header
        // button that was always enabled and reported nothing.
        actions={
          <div className="flex items-center gap-2">
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </Button>
            </form>
          </div>
        }
      />

      <CampaignJourney phase={phaseForStatus(campaign.status)} />

      {/* Before it goes: is it ready, who does it reach, and say so out loud. */}
      {notYetSent ? (
        <LaunchPanel
          campaignId={campaign.id}
          audienceSize={audienceSize}
          fromLabel={fromLabel}
          blockers={blockers}
        />
      ) : null}

      {/* What it is — the facts, compact. */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
            <span className="text-xs text-muted-foreground">
              created <LocalTime iso={campaign.created_at} />
              {/* A scheduled campaign's whole point is WHEN — say it here rather
                  than leaving "scheduled" as a status with no time attached. */}
              {campaign.status === "scheduled" && campaign.scheduled_at ? (
                <> · goes out <LocalTime iso={campaign.scheduled_at} /></>
              ) : null}
              {campaign.sent_at ? <> · sent <LocalTime iso={campaign.sent_at} /></> : null}
            </span>
          </div>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b py-1.5 sm:border-none sm:py-0">
                <dt className="shrink-0 text-xs text-muted-foreground">{k}</dt>
                <dd className="min-w-0 truncate text-right text-sm font-medium" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
          {campaign.variants.length > 0 ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">A/B variants (first matching tag wins)</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {campaign.variants.map((v, i) => (
                  <li key={i}>
                    tagged <span className="font-medium text-foreground">“{v.tag}”</span> → their own template
                    {v.subject ? <> · subject “{v.subject}”</> : null}
                  </li>
                ))}
                <li>everyone else → the base message</li>
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Before it goes: read each person's actual copy. */}
      {notYetSent ? (
        <PreFlight campaignId={campaign.id} recipients={previewRes.data} total={previewRes.total} fromLabel={fromLabel} />
      ) : null}

      {/* What's happening — live status, funnel, and per-recipient engagement. */}
      <CampaignLive
        initial={{
          campaign,
          analytics,
          recipients: recipientsRes.data,
          total: recipientsRes.total ?? recipientsRes.data.length,
        }}
      />

      {/* Turn the send into a nurture — enroll engaged (or cold) people into a sequence. */}
      {campaign.status === "sent" ? (
        <div className="mt-6">
          <FollowUp campaignId={campaign.id} sequences={sequencesRes.data.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      ) : null}
    </>
  );
}
