import Link from "next/link";
import { Megaphone, Send, Trash2 } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Campaign } from "@/lib/types";
import { CampaignComposer } from "./composer";
import { deleteCampaign, sendCampaign } from "./actions";

const STATUS_VARIANT: Record<Campaign["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  scheduled: "warning",
  sending: "warning",
  sent: "success",
};

export default async function CampaignsPage() {
  let rows: Campaign[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  let lists: { id: string; name: string }[] = [];
  let templates: { id: string; name: string; slug: string }[] = [];
  try {
    rows = (await api.listCampaigns()).data;
    lists = (await api.listLists()).data.map((l) => ({ id: l.id, name: l.name }));
    templates = (await api.listTemplates()).data.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
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
        <PageHeader title="Campaigns" />
        <FeatureLocked info={locked} blurb="Campaigns send a template to a whole contact list in one go — bulk marketing without leaving rootmail." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Campaigns" description="Send one email to everyone on a list — a newsletter, a promotion, an announcement." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">New campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignComposer lists={lists} templates={templates} />
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {failed ? (
            <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
          ) : rows && rows.length === 0 ? (
            <EmptyState icon={<Megaphone className="size-6" />} title="No campaigns yet" description="Create one to send a template to a list." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.status === "sent"
                            ? `${c.stats.sent} sent · ${c.stats.suppressed} suppressed`
                            : c.stats.recipients
                              ? `${c.stats.recipients} recipients`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.status === "draft" || c.status === "scheduled" ? (
                              <form action={sendCampaign} className="inline">
                                <input type="hidden" name="id" value={c.id} />
                                <Button type="submit" size="sm" variant="outline">
                                  <Send className="size-3.5" /> Send
                                </Button>
                              </form>
                            ) : null}
                            <form action={deleteCampaign} className="inline">
                              <input type="hidden" name="id" value={c.id} />
                              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="size-4" />
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
