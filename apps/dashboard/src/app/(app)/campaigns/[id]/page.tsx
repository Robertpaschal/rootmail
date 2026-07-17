import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FunnelCard } from "@/components/app/funnel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, api } from "@/lib/rootmail";
import type { Campaign, CampaignAnalytics } from "@/lib/types";
import { deleteCampaign, sendCampaign } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

const STATUS_VARIANT: Record<Campaign["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  scheduled: "warning",
  sending: "warning",
  sent: "success",
};

// The campaign as a record: what it is, what happened, and how it performed.
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let campaign: Campaign;
  try {
    campaign = await api.getCampaign(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const analytics: CampaignAnalytics | null = await api.campaignAnalytics(id).catch(() => null);

  // The From is decided at send time: the campaign's own address if set, else the
  // org's default verified sender, else rootmail's no-reply — show what will actually go out.
  let fromLabel = campaign.from_email;
  if (!fromLabel) {
    const senders = (await api.listSenders().catch(() => ({ data: [] }))).data;
    const def = senders.find((s) => s.status === "verified" && s.is_default) ?? senders.find((s) => s.status === "verified");
    fromLabel = def ? (def.display_name ? `${def.display_name} <${def.email}>` : def.email) : "rootmail address (no sender verified)";
  }

  const facts: [string, string][] = [
    ["Subject", campaign.subject ?? "—"],
    ["From", fromLabel],
    ["Audience", campaign.segment_tag ? `contacts tagged “${campaign.segment_tag}”` : "everyone on the list"],
    ["Recipients", campaign.stats.recipients ? campaign.stats.recipients.toLocaleString() : "—"],
    ["Suppressed", campaign.stats.suppressed.toLocaleString()],
    ["Created", new Date(campaign.created_at).toLocaleString()],
    ["Sent", campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : "not yet"],
  ];

  return (
    <>
      <PageHeader
        title={campaign.name}
        backHref="/campaigns"
        backLabel="Campaigns"
        actions={
          <div className="flex items-center gap-2">
            {campaign.status === "draft" || campaign.status === "scheduled" ? (
              <form action={sendCampaign}>
                <input type="hidden" name="id" value={campaign.id} />
                <Button type="submit" size="sm">
                  <Send className="size-3.5" /> Send now
                </Button>
              </form>
            ) : null}
            <form action={deleteCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Campaign
              <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
            {campaign.variants.length > 0 ? (
              <div className="border-t pt-3">
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

        {analytics ? <FunnelCard stats={analytics} /> : null}
      </div>
    </>
  );
}
