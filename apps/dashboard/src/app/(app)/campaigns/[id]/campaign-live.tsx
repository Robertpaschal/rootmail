"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Send,
  ShieldOff,
} from "lucide-react";
import { refreshCampaign } from "../actions";
import { FunnelCard } from "@/components/app/funnel-card";
import { LocalTime } from "@/components/app/local-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import type { Campaign, CampaignAnalytics, CampaignRecipient } from "@/lib/types";

// The campaign as a live record: while it's sending, the progress band + recipient
// rows update on their own; once sent, opens and clicks keep trickling in (SES
// reports them asynchronously), so we keep polling for a few minutes and offer a
// manual refresh after. Deliberately NOT the single-message journey — each row
// links out to that; here it's the whole audience at a glance.

type RecipTone = "click" | "open" | "delivered" | "sent" | "bad" | "muted";
const RECIP_META: Record<string, { label: string; tone: RecipTone }> = {
  clicked: { label: "Clicked", tone: "click" },
  opened: { label: "Opened", tone: "open" },
  delivered: { label: "Delivered", tone: "delivered" },
  sent: { label: "Sent", tone: "sent" },
  queued: { label: "Queued", tone: "sent" },
  sending: { label: "Sending", tone: "sent" },
  bounced: { label: "Bounced", tone: "bad" },
  complained: { label: "Spam", tone: "bad" },
  failed: { label: "Failed", tone: "bad" },
  suppressed: { label: "Not sent", tone: "muted" },
};
const TONE_BADGE: Record<RecipTone, "success" | "secondary" | "warning" | "destructive" | "muted" | "outline"> = {
  click: "success",
  open: "success",
  delivered: "secondary",
  sent: "outline",
  bad: "destructive",
  muted: "muted",
};

function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const p = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname}${p}`.replace(/\/$/, "");
  } catch {
    return u;
  }
}

interface LiveData {
  campaign: Campaign;
  analytics: CampaignAnalytics | null;
  recipients: CampaignRecipient[];
  total: number;
}

export function CampaignLive({ initial }: { initial: LiveData }) {
  const [data, setData] = useState<LiveData>(initial);
  const [polling, setPolling] = useState(false);
  const sentPollsRef = useRef(0);
  const { campaign, analytics, recipients, total } = data;

  const poll = useCallback(async () => {
    setPolling(true);
    const res = await refreshCampaign(initial.campaign.id, 100);
    setPolling(false);
    if (res.campaign) {
      setData({
        campaign: res.campaign,
        analytics: res.analytics ?? null,
        recipients: res.recipients ?? [],
        total: res.total ?? 0,
      });
    }
  }, [initial.campaign.id]);

  // Auto-refresh: fast while sending; a slower, capped window after sent so early
  // opens/clicks appear without polling forever.
  useEffect(() => {
    if (campaign.status === "sending") {
      const t = setInterval(poll, 3000);
      return () => clearInterval(t);
    }
    if (campaign.status === "sent" && sentPollsRef.current < 20) {
      const t = setInterval(() => {
        sentPollsRef.current += 1;
        poll();
      }, 12000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [campaign.status, poll]);

  const s = campaign.stats;
  const recipients_total = s.recipients || total || 0;
  const live = campaign.status === "sending" || (campaign.status === "sent" && sentPollsRef.current < 20);

  return (
    <div className="space-y-6">
      {/* Status band — the headline state of the send. */}
      {campaign.status === "sending" ? (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <p className="font-medium">Sending…</p>
              <span className="text-sm text-muted-foreground">
                {s.sent.toLocaleString()} of {recipients_total.toLocaleString()} sent
                {s.suppressed ? ` · ${s.suppressed} skipped` : ""}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${recipients_total ? Math.min(100, Math.round(((s.sent + s.suppressed) / recipients_total) * 100)) : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : campaign.status === "scheduled" ? (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-2 p-5 text-sm">
            <CalendarClock className="size-4 text-amber-500" />
            <span className="font-medium">Scheduled</span>
            {campaign.scheduled_at ? (
              <span className="text-muted-foreground">for <LocalTime iso={campaign.scheduled_at} /></span>
            ) : null}
            <span className="text-muted-foreground">— it&apos;ll send automatically.</span>
          </CardContent>
        </Card>
      ) : campaign.status === "draft" ? (
        <Card className="border-l-4 border-l-muted-foreground/40">
          <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Send className="size-4" /> Draft — review the details below, then press <span className="font-medium text-foreground">Send now</span>.
          </CardContent>
        </Card>
      ) : null}

      {/* Engagement funnel — live for the first few minutes after send. */}
      {campaign.status === "sent" || campaign.status === "sending" ? (
        <FunnelCard
          stats={analytics ?? { total: 0, by_status: {}, funnel: { sent: 0, delivered: 0, opened: 0, clicked: 0 }, rates: { delivery: 0, open: 0, click: 0, click_to_open: 0, bounce: 0 } }}
          title="Engagement"
        >
          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {live ? (
                <><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span> Live — updates on its own</>
              ) : (
                "Opens and clicks are reported by mailbox providers over time."
              )}
            </span>
            <button type="button" onClick={poll} disabled={polling} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium hover:bg-accent disabled:opacity-60">
              {polling ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Refresh
            </button>
          </div>
        </FunnelCard>
      ) : null}

      {/* Per-recipient engagement — who got it and exactly what they did. */}
      {recipients.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Recipients</CardTitle>
            <span className="text-xs text-muted-foreground">
              {total > recipients.length ? `Showing ${recipients.length} of ${total.toLocaleString()}` : `${total.toLocaleString()} ${total === 1 ? "person" : "people"}`} · most engaged first
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recipients.map((r) => {
                // Opens/clicks are engagement, not a status — reflect the furthest
                // the person got: clicked > opened > their delivery status.
                const effective = r.clicked_at ? "clicked" : r.opened_at ? "opened" : r.status;
                const meta = RECIP_META[effective] ?? { label: r.status, tone: "muted" as RecipTone };
                return (
                  <li key={r.message_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <Link href={`/messages/${r.message_id}`} className="font-medium hover:underline">
                        {r.name ? `${r.name}` : r.email}
                      </Link>
                      {r.name ? <span className="ml-2 text-xs text-muted-foreground">{r.email}</span> : null}
                    </span>

                    {/* What they did — the engagement story for this person. */}
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      {r.clicked_at ? (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title={r.clicked_url ?? undefined}>
                          <MousePointerClick className="size-3.5" />
                          {r.clicked_url ? shortUrl(r.clicked_url) : "clicked"} · {relativeTime(r.clicked_at)}
                        </span>
                      ) : r.opened_at ? (
                        <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                          <Eye className="size-3.5" /> opened · {relativeTime(r.opened_at)}
                        </span>
                      ) : meta.tone === "bad" ? (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle className="size-3.5" /> {meta.label.toLowerCase()}</span>
                      ) : meta.tone === "muted" ? (
                        <span className="flex items-center gap-1"><ShieldOff className="size-3.5" /> {meta.label.toLowerCase()}</span>
                      ) : (
                        <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5" /> delivered</span>
                      )}
                    </span>

                    <Badge variant={TONE_BADGE[meta.tone]} className="shrink-0">{meta.label}</Badge>
                    <Link href={`/messages/${r.message_id}`} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Open message">
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : campaign.status === "sent" ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">No recipients recorded for this send.</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
