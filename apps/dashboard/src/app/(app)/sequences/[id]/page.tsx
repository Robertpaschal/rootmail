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

      {/* Where it stands, before anything you could change about it. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "In progress", value: activeCount, hint: "receiving it right now" },
          { label: "Finished", value: doneCount, hint: "reached the last email" },
          { label: "Emails", value: journeyShape(sequence.steps).emails, hint: "in the journey" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{s.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SequenceManage sequence={sequence} templates={templates} analytics={analytics} />
        </div>

        <div className="space-y-6">
          {/* Totals only — the per-step breakdown now sits on the steps
              themselves, where you don't have to match "#2" to an email. */}
          {analytics ? <FunnelCard stats={analytics} /> : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enroll a contact</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={enrollAction} className="flex gap-2">
                <input type="hidden" name="id" value={sequence.id} />
                <Input name="email" type="email" placeholder="contact@company.com" required />
                <Button type="submit" size="icon" aria-label="Enroll">
                  <UserPlus className="size-4" />
                </Button>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollments ({enrollments.length})</CardTitle>
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
