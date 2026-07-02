import { notFound } from "next/navigation";
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
import { SequenceBuilder } from "../builder";
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

  return (
    <>
      <PageHeader title={sequence.name} backHref="/sequences" backLabel="Sequences" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SequenceBuilder sequence={sequence} templates={templates} />
        </div>

        <div className="space-y-6">
          {analytics ? (
            <FunnelCard stats={analytics}>
              {analytics.steps.length > 0 ? (
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    By step
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">Step</th>
                        <th className="py-1 text-right font-medium">Sent</th>
                        <th className="py-1 text-right font-medium">Delivered</th>
                        <th className="py-1 text-right font-medium">Opened</th>
                        <th className="py-1 text-right font-medium">Clicked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.steps.map((s) => (
                        <tr key={s.step} className="border-t">
                          <td className="py-1.5 font-medium">#{s.step + 1}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.sent}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.delivered}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.opened}</td>
                          <td className="py-1.5 text-right tabular-nums">{s.clicked}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </FunnelCard>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enroll a contact</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={enrollAction} className="flex gap-2">
                <input type="hidden" name="id" value={sequence.id} />
                <Input name="email" type="email" placeholder="contact@company.com" required />
                <Button type="submit" size="icon" aria-label="Enroll">
                  <UserPlus className="size-4" />
                </Button>
              </form>
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

          <form action={deleteSequenceAction}>
            <input type="hidden" name="id" value={sequence.id} />
            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete sequence
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
