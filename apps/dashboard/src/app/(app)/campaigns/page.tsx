import Link from "next/link";
import { ArrowRight, BarChart3, Megaphone, Plus, Send, Split, Trash2, Users } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Campaign } from "@/lib/types";
import { deleteCampaign, sendCampaign } from "./actions";

const STATUS_VARIANT: Record<Campaign["status"], "secondary" | "warning" | "success"> = {
  draft: "secondary",
  scheduled: "warning",
  sending: "warning",
  sent: "success",
};

// The campaign story in three beats — shown when there's nothing yet, so the
// empty page teaches the flow and doubles as the call to action.
const BEATS = [
  {
    icon: Users,
    title: "Pick your audience",
    body: "A list of contacts — everyone, or just the ones carrying a tag (“vip”, “trial”, …).",
  },
  {
    icon: Split,
    title: "Design the message",
    body: "Pick a studio-designed template, tweak the subject — and A/B it: differently-tagged contacts can get different versions.",
  },
  {
    icon: BarChart3,
    title: "Send & watch it land",
    body: "Send or schedule, then follow delivered → opened → clicked per campaign. Bounces auto-suppress.",
  },
];

export default async function CampaignsPage() {
  let rows: Campaign[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  try {
    rows = (await api.listCampaigns()).data;
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
        <FeatureLocked info={locked} blurb="Campaigns send a designed email to a whole audience in one go — with tag segments and A/B variants." />
      </>
    );
  }

  if (failed) {
    return (
      <>
        <PageHeader title="Campaigns" description="Send one email to a whole audience — a newsletter, a promotion, an announcement." />
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      </>
    );
  }

  const list = rows ?? [];
  const empty = list.length === 0;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Send one email to a whole audience — a newsletter, a promotion, an announcement."
        actions={
          !empty ? (
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" /> New campaign
            </Link>
          ) : undefined
        }
      />

      {empty ? (
        <Reveal className="space-y-6">
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title="Your first campaign starts here"
            description="One flow takes you from audience to designed message to send — nothing to configure first."
            action={
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Create a campaign <ArrowRight className="size-4" />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {BEATS.map((b, i) => (
              <Card key={b.title}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><b.icon className="size-4" /></span>
                    <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{b.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Need contacts first?{" "}
            <Link href="/contacts?add=import" className="text-primary hover:underline">Import them from a file</Link>
            {" "}or{" "}
            <Link href="/contacts?tab=audiences" className="text-primary hover:underline">create an audience</Link>.
          </p>
        </Reveal>
      ) : (
        <Reveal>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        {c.segment_tag ? (
                          <span className="ml-2 text-xs text-muted-foreground">tag: {c.segment_tag}</span>
                        ) : null}
                        {c.variants.length > 0 ? (
                          <Badge variant="outline" className="ml-2 text-[10px]">A/B ×{c.variants.length + 1}</Badge>
                        ) : null}
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
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{relativeTime(c.created_at)}</TableCell>
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
        </Reveal>
      )}
    </>
  );
}
