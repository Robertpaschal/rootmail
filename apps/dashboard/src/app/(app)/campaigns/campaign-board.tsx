import Link from "next/link";
import { ActionForm } from "@/components/app/action-form";
import { Send, Split, Trash2 } from "lucide-react";
import { Line, type Station } from "@rootmail/design";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { countdown, relativeTime } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteCampaign } from "./actions";

/**
 * CAMPAIGNS ARE A PIPELINE, SO THE PAGE IS A PIPELINE.
 *
 * The old page was a five-column table sorted by creation date, which put a
 * draft nobody has finished writing directly above a campaign that went to
 * forty thousand people last night, at the same weight, in the same object as
 * the messages table and the contacts table.
 *
 * A campaign has exactly one interesting axis and it is not time — it is
 * **phase**: written, waiting, going out, gone. Each phase asks a different
 * question of the operator ("finish it", "is the date right", "watch it",
 * "what happened"), so each phase is its own band with its own verb, and the
 * cards inside carry the number that phase is about: a draft carries its
 * audience, a sent campaign carries what actually left.
 *
 * A plain module, not `"use client"`: the campaigns page is a server component
 * and renders this directly, so nothing here may cross that boundary — a helper
 * imported from a client module typechecks cleanly and crashes in production
 * (CLAUDE.md).
 */

type Phase = Campaign["status"];

const PHASES: { id: Phase; title: string; ask: string }[] = [
  { id: "sending", title: "Going out now", ask: "Mail is on the wire. Nothing to do but watch it." },
  { id: "scheduled", title: "Waiting for its date", ask: "Written and addressed. It leaves on its own." },
  { id: "draft", title: "Still being written", ask: "Nobody has received these. Finish one and send it." },
  { id: "sent", title: "Gone", ask: "What actually left, and what came back." },
];

/** The campaign's own line: audience → send → outcome. Same rendering law as a
 *  message row — a campaign that has not gone out is dotted, not hopeful. */
function campaignStations(c: Campaign): Station[] {
  const audience: Station = {
    label: c.stats.recipients ? `${c.stats.recipients.toLocaleString()} addressed` : "no audience yet",
    state: c.stats.recipients ? "witnessed" : "unknown",
  };
  if (c.status === "draft" || c.status === "scheduled")
    return [audience, { label: "not sent", state: "unknown" }];
  if (c.status === "sending")
    return [audience, { label: "sending", state: "witnessed", inFlight: true }];
  return [
    audience,
    { label: `${c.stats.sent.toLocaleString()} sent`, state: "witnessed" },
    ...(c.stats.failed > 0
      ? ([{ label: `${c.stats.failed} failed`, state: "stopped" }] as Station[])
      : []),
  ];
}

function CampaignCard({ c }: { c: Campaign }) {
  const sendable = c.status === "draft" || c.status === "scheduled";
  return (
    <li className="group flex flex-col gap-3 border-b border-rule py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link href={`/campaigns/${c.id}`} className="font-medium tracking-heading hover:underline">
            {c.name}
          </Link>
          {c.segment_tag ? (
            <span className="font-mono text-[11px] text-muted-foreground" data-fact>
              tag:{c.segment_tag}
            </span>
          ) : null}
          {c.variants.length > 0 ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Split className="size-2.5" /> A/B ×{c.variants.length + 1}
            </Badge>
          ) : null}
        </div>
        {c.subject ? (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{c.subject}</p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">No subject line yet.</p>
        )}
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground" data-fact>
          {c.status === "sent" && c.sent_at
            ? `sent ${relativeTime(c.sent_at)}`
            : c.status === "scheduled" && c.scheduled_at
              ? // `relativeTime` points backwards and answers "just now" for
                // anything in the future — which on a scheduled campaign is a
                // false statement about when it goes out.
                `leaves in ${countdown(c.scheduled_at)}`
              : `created ${relativeTime(c.created_at)}`}
          {c.stats.suppressed > 0 ? ` · ${c.stats.suppressed} held back by suppression` : ""}
        </p>
      </div>

      <div className="shrink-0 overflow-x-auto pb-1">
        <Line stations={campaignStations(c)} scale="page" />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {sendable ? (
          // Sending from a row gave no audience count, no readiness check and no
          // confirm — for the one action that cannot be undone. It goes to the
          // campaign, where all three live.
          <Link href={`/campaigns/${c.id}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
            <Send className="size-3.5" /> Review &amp; send
          </Link>
        ) : null}
        <ActionForm action={deleteCampaign} className="inline">
          <input type="hidden" name="id" value={c.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            aria-label={`Delete ${c.name}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}

export function CampaignBoard({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="space-y-10">
      {PHASES.map((phase) => {
        const rows = campaigns
          .filter((c) => c.status === phase.id)
          .sort((a, b) => (b.sent_at ?? b.scheduled_at ?? b.created_at).localeCompare(a.sent_at ?? a.scheduled_at ?? a.created_at));
        if (rows.length === 0) return null;
        // How many people this phase accounts for — a draft phase holding 40k
        // addressed contacts is a different situation from one holding 12.
        const reach = rows.reduce(
          (n, c) => n + (c.status === "sent" ? c.stats.sent : c.stats.recipients),
          0,
        );
        return (
          <section key={phase.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/20 pb-2">
              <h2 className="text-sm font-medium uppercase tracking-wide">{phase.title}</h2>
              <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                {rows.length} campaign{rows.length === 1 ? "" : "s"} ·{" "}
                {reach.toLocaleString()} {phase.id === "sent" ? "messages sent" : "people addressed"}
              </span>
            </div>
            <p className="pt-2 text-sm text-muted-foreground">{phase.ask}</p>
            <ul className="mt-2">
              {rows.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
