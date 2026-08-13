import { notFound } from "next/navigation";
import { ActionForm } from "@/components/app/action-form";
import { Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FunnelCard } from "@/components/app/funnel-card";
import { api, ApiError } from "@/lib/rootmail";
import type { Enrollment, Sequence, SequenceAnalytics } from "@/lib/types";
import { SequenceManage } from "./manage";
import { journeyShape, journeySummary, triggerSentence } from "../describe";
import { deleteSequenceAction, enrollAction } from "../actions";

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
          above it. */}
      <p className="mb-6 text-sm text-muted-foreground">
        {activeCount === 0 && doneCount === 0 ? (
          <>
            Nobody has been through this yet — {journeyShape(sequence.steps).emails}{" "}
            {journeyShape(sequence.steps).emails === 1 ? "email" : "emails"} waiting for the first
            enrolment.
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
            {" "}· {journeyShape(sequence.steps).emails}{" "}
            {journeyShape(sequence.steps).emails === 1 ? "email" : "emails"} in it
          </>
        )}
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SequenceManage sequence={sequence} templates={templates} analytics={analytics} />
        </div>

        <div className="space-y-6">
          {/* Totals only — the per-step breakdown now sits on the steps
              themselves, where you don't have to match "#2" to an email. */}
          {analytics ? <FunnelCard stats={analytics} /> : null}

          {/* One card, not two. Adding someone and seeing who is already in are
              the same task, and splitting them meant the action sat above a
              list it appeared unrelated to. */}
          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">
                Who&apos;s in it{enrollments.length > 0 ? ` (${enrollments.length})` : ""}
              </CardTitle>
              <ActionForm action={enrollAction} className="flex gap-2">
                <input type="hidden" name="id" value={sequence.id} />
                <Input name="email" type="email" placeholder="Add someone by email" required />
                <Button type="submit" size="icon" aria-label="Enroll">
                  <UserPlus className="size-4" />
                </Button>
              </ActionForm>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Nobody is enrolled yet. Add someone above, or let the
                        trigger bring them in on its own.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {enrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.email}</TableCell>
                      <TableCell className="text-muted-foreground">{e.current_step}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            e.status === "active"
                              ? "secondary"
                              : e.status === "completed"
                                ? "success"
                                : "muted"
                          }
                        >
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <ActionForm action={deleteSequenceAction}>
            <input type="hidden" name="id" value={sequence.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete sequence
            </Button>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
