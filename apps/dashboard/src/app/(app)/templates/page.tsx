import Link from "next/link";
import { FileText, FileUp, Plus } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Template } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function TemplatesPage() {
  let templates: Template[] | null = null;
  let failed: string | null = null;
  let isApiErr = false;
  try {
    templates = (await api.listTemplates()).data;
  } catch (err) {
    if (err instanceof ConnectionError || err instanceof ApiError) {
      failed = err.message;
      isApiErr = err instanceof ApiError;
    } else {
      failed = "An unexpected error occurred.";
    }
  }

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable emails with {{variables}} — send them by slug from the app or the API."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/templates/import"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              <FileUp className="size-4" /> Import
            </Link>
            <Link href="/templates/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> New template
            </Link>
          </div>
        }
      />

      {failed ? (
        <ConnectionErrorCard message={failed} showReconnect={isApiErr} />
      ) : templates && templates.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No templates yet"
          description="Create a reusable email once, then send it by slug with per-send variables."
          action={
            <Link href="/templates/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> New template
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(templates ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/templates/${t.id}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{t.slug}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">v{t.current_version}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {relativeTime(t.updated_at)}
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
