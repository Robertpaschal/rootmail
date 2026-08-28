import { notFound } from "next/navigation";
import { ActionForm } from "@/components/app/action-form";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/rootmail";
import type { Enrollment, Sequence, SequenceAnalytics } from "@/lib/types";
import { SequenceWorkbench } from "./workbench";
import { journeyShape, journeySummary, triggerSentence } from "../describe";
import { deleteSequenceAction } from "../actions";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let sequence: Sequence;
  let templates: { slug: string; name: string }[] = [];
  let enrollments: Enrollment[] = [];
  try {
    sequence = await api.getSequence(id);
    templates = (await api.listTemplates()).data.map((t) => ({ slug: t.slug, name: t.name }));
    enrollments = (await api.listEnrollments(id)).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  // Engagement is additive — never let an analytics hiccup break the builder.
  const analytics: SequenceAnalytics | null = await api.sequenceAnalytics(id).catch(() => null);

  const activeCount = enrollments.filter((e) => e.status === "active").length;
  const doneCount = enrollments.filter((e) => e.status === "completed").length;
  const emails = journeyShape(sequence.steps).emails;

  return (
    <>
      <PageHeader
        title={sequence.name}
        description={`${triggerSentence(sequence.trigger)} · ${journeySummary(sequence.steps)}`}
        backHref="/sequences"
        backLabel="Sequences"
        actions={
          <Badge variant={sequence.status === "active" ? "success" : "muted"}>
            {sequence.status === "active" ? "On" : "Paused"}
          </Badge>
        }
      />

      {/* Where it stands, as a sentence.
          This was three cards holding three integers — a row of the screen
          spent on numbers that only mean anything next to each other. "12
          people are receiving it, 8 have finished" is the same data read in
          one glance, and it belongs to the sequence rather than floating
          above it.

          The rates ride along on the same line. They used to be a whole
          Engagement card in the right column, stacked above the people —
          which put an aggregate funnel next to the per-step breakdown that
          already says the same thing better, and made the column a box
          stack. Rates are a header stat, not a panel. */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p>
          {/* A sequence with no emails yet says so in the journey card, loudly
              and with the button that fixes it. Repeating it here as "0 emails
              waiting for the first enrolment" was worse than saying nothing:
              it promises a wait that isn't the problem, and a brand-new
              sequence is the first thing a new user sees. The one case worth
              a line is people enrolled in a sequence that can't send them
              anything — that's a fault, and nothing else on the page says it. */}
          {emails === 0 ? (
            activeCount > 0 ? (
              <span className="text-destructive">
                <span className="font-medium tabular-nums">{activeCount}</span>{" "}
                {activeCount === 1 ? "person is" : "people are"} enrolled, but there are no emails
                to send them.
              </span>
            ) : null
          ) : activeCount === 0 && doneCount === 0 ? (
            <>
              Nobody has been through this yet — {emails} {emails === 1 ? "email" : "emails"} waiting
              for the first enrolment.
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums text-foreground">{activeCount}</span>{" "}
              {activeCount === 1 ? "person is" : "people are"} receiving this right now
              {doneCount > 0 ? (
                <>
                  {" "}·{" "}
                  <span className="font-medium tabular-nums text-foreground">{doneCount}</span>{" "}
                  finished the whole journey
                </>
              ) : null}
              {" "}· {emails} {emails === 1 ? "email" : "emails"} in it
            </>
          )}
        </p>
        {analytics && analytics.total > 0 ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-witnessed">
              Delivery {analytics.rates.delivery}%
            </span>
            <span className="text-muted-foreground">Open {analytics.rates.open}%</span>
            <span className="text-muted-foreground">Click {analytics.rates.click}%</span>
            {analytics.rates.bounce > 0 ? (
              <span className="text-stopped">
                Bounce {analytics.rates.bounce}%
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <SequenceWorkbench
        sequence={sequence}
        templates={templates}
        analytics={analytics}
        enrollments={enrollments}
      />

      {/* Destructive action, out of the reading path — it isn't a peer of the
          journey and shouldn't sit in a column beside it. */}
      <div className="mt-6 border-t pt-4">
        <ActionForm action={deleteSequenceAction}>
          <input type="hidden" name="id" value={sequence.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Delete sequence
          </Button>
        </ActionForm>
      </div>
    </>
  );
}
