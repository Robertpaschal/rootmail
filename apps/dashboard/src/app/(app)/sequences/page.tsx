import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { FeatureLocked, type FeatureLockedInfo, asFeatureLocked } from "@/components/app/feature-locked";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Sequence } from "@/lib/types";

export default async function SequencesPage() {
  let rows: Sequence[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  let locked: FeatureLockedInfo | null = null;
  try {
    rows = (await api.listSequences()).data;
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
        <PageHeader title="Sequences" />
        <FeatureLocked info={locked} blurb="Sequences drip a series of timed, event-driven emails to your contacts automatically." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sequences"
        description="Automated, multi-step email flows — triggered by events, with waits, branches, and exit-on-reply."
        actions={
          <Link href="/sequences/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="size-4" /> New sequence
          </Link>
        }
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : rows && rows.length === 0 ? (
        <EmptyState
          icon={<Workflow className="size-6" />}
          title="No sequences yet"
          description="Create one to drip a welcome series, onboarding, or re-engagement flow."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link href={`/sequences/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.trigger.type === "contact_tagged" ? `tagged: ${s.trigger.tag}` : s.trigger.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.steps.length}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "success" : "muted"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(s.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
