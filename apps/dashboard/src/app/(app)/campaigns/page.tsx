import Link from "next/link";
import { ArrowRight, BarChart3, Megaphone, Plus, Split, Users } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Reveal } from "@/components/app/motion";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Campaign } from "@/lib/types";
import { CampaignBoard } from "./campaign-board";

// The campaign story in three beats — a REAL sequence, so it is numbered and
// drawn as one: each beat only makes sense after the one before it. (The three
// bordered tiles this used to be encoded nothing; three tiles is what every
// other empty state in the product also was.)
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
  let errStatus: number | undefined;
  let locked: FeatureLockedInfo | null = null;
  try {
    rows = (await api.listCampaigns()).data;
  } catch (err) {
    if (err instanceof ApiError && err.code === "feature_locked") locked = asFeatureLocked(err.details);
    else if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      errStatus = err instanceof ApiError ? err.status : undefined;
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
        <ConnectionErrorCard message={failed} status={errStatus} />
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
          {/* A numbered sequence, because this genuinely IS one — you cannot
              design the message before you know who it is for. Drawn as a
              single spine rather than three equal boxes, which is the shape of
              three unrelated things. */}
          <ol className="relative ml-3 border-l border-rule pl-7">
            {BEATS.map((b, i) => (
              <li key={b.title} className="relative pb-7 last:pb-0">
                <span
                  aria-hidden
                  className="absolute -left-[2.15rem] top-0 grid size-7 place-items-center rounded-full border border-rule bg-background shadow-knockout"
                >
                  <b.icon className="size-3.5 text-ink-muted" />
                </span>
                <p className="flex items-baseline gap-2 text-sm font-medium">
                  <span className="font-mono text-[11px] text-muted-foreground" data-fact>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {b.title}
                </p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{b.body}</p>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Need contacts first?{" "}
            <Link href="/contacts?add=import" className="text-primary hover:underline">Import them from a file</Link>
            {" "}or{" "}
            <Link href="/contacts?tab=audiences" className="text-primary hover:underline">create an audience</Link>.
          </p>
        </Reveal>
      ) : (
        <Reveal>
          <CampaignBoard campaigns={list} />
        </Reveal>
      )}
    </>
  );
}
