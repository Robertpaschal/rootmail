import Link from "next/link";
import { FileText, FileUp, Plus } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { Template } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TemplatesTable, type TemplateRow } from "./templates-table";

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

  const rows: TemplateRow[] = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    type: t.type,
    current_version: t.current_version,
    updated_at: t.updated_at,
  }));

  return (
    <>
      <PageHeader
        title="Templates"
        description="Emails you design once and reuse everywhere — blocks for product email, designs for your audience."
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No templates yet"
          description="Create a reusable email once, then use it in sends, campaigns, and sequences."
          action={
            <Link href="/templates/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" /> New template
            </Link>
          }
        />
      ) : (
        <TemplatesTable templates={rows} />
      )}
    </>
  );
}
