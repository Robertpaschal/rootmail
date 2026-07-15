import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Paperclip } from "lucide-react";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { LiveStatus } from "./live-status";
import { MessageContent } from "./message-content";
import { DownloadProof } from "./download-proof";
import { LocalTime } from "@/components/app/local-time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AuditEntry, Message } from "@/lib/types";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeOf(trail: AuditEntry[], event: string): string | undefined {
  return trail.find((e) => e.event === event)?.timestamp;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let message: Message;
  let trail: AuditEntry[];
  try {
    const [m, a] = await Promise.all([api.getMessage(id), api.getAudit(id)]);
    message = m;
    trail = a.trail;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <PageHeader title="Message" backHref="/messages" backLabel="Messages" />
        <ConnectionErrorCard
          message={err instanceof ConnectionError || err instanceof ApiError ? err.message : "An unexpected error occurred."}
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  const sentAt = timeOf(trail, "sent") ?? message.created_at;
  const deliveredAt = timeOf(trail, "delivered");
  const fromLabel = message.from.name ? `${message.from.name} · ${message.from.email}` : message.from.email;

  return (
    <>
      <PageHeader title={message.subject || "(no subject)"} description={`To ${message.to}`} backHref="/messages" backLabel="Messages" />

      {/* The send tracker — advances on its own; sandbox gets its own treatment. */}
      <div className="mb-6">
        <LiveStatus id={message.id} initialMessage={message} initialTrail={trail} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Content</CardTitle>
            </CardHeader>
            <CardContent>
              <MessageContent html={message.rendered_html} text={message.rendered_text} />
            </CardContent>
          </Card>

          {message.attachments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attachments</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {message.attachments.map((a) => (
                  <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <span className="font-medium">{a.filename}</span>
                    <span className="text-xs text-muted-foreground">{fmtSize(a.size)}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Details a normal sender cares about. */}
        <div className="space-y-4">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              <DetailRow label="To"><span>{message.to}</span></DetailRow>
              <DetailRow label="From"><span>{fromLabel}</span></DetailRow>
              {message.reply_to ? <DetailRow label="Replies to"><span>{message.reply_to}</span></DetailRow> : null}
              <DetailRow label="Sent"><LocalTime iso={sentAt} /></DetailRow>
              {deliveredAt ? <DetailRow label="Delivered"><LocalTime iso={deliveredAt} /></DetailRow> : null}
              {message.scheduled_at ? <DetailRow label="Scheduled"><LocalTime iso={message.scheduled_at} /></DetailRow> : null}
              {message.attachments.length > 0 ? <DetailRow label="Attachments">{message.attachments.length}</DetailRow> : null}
              {message.sandbox ? <DetailRow label="Environment"><Badge variant="warning">Test</Badge></DetailRow> : null}
            </CardContent>
          </Card>

          {/* Developer identifiers — for the API/CLI/SDK, out of the everyday view. */}
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-medium">
              Developer details
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="divide-y px-6 pb-2">
              <DetailRow label="Message ID">
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-xs">{message.id}</span>
                  <CopyButton value={message.id} />
                </span>
              </DetailRow>
              {message.idempotency_key ? (
                <DetailRow label="Idempotency key"><span className="font-mono text-xs">{message.idempotency_key}</span></DetailRow>
              ) : null}
              <DetailRow label="Type"><span className="capitalize">{message.type}</span></DetailRow>
              <DetailRow label="Priority"><span className="capitalize">{message.priority}</span></DetailRow>
              {message.template_id ? (
                <DetailRow label="Template"><span className="font-mono text-xs">{message.template_id}{message.template_version ? ` · v${message.template_version}` : ""}</span></DetailRow>
              ) : null}
              {message.sub_tenant_id ? (
                <DetailRow label="Client (sub-tenant)"><Link href={`/sub-tenants/${message.sub_tenant_id}`} className="font-mono text-xs text-primary hover:underline">{message.sub_tenant_id}</Link></DetailRow>
              ) : null}
              {message.provider ? <DetailRow label="Provider"><span className="capitalize">{message.provider}</span></DetailRow> : null}
              {message.provider_message_id ? <DetailRow label="Provider message ID"><span className="font-mono text-xs">{message.provider_message_id}</span></DetailRow> : null}
              {message.content_hash ? <DetailRow label="Content hash"><span className="font-mono text-xs">{message.content_hash.slice(0, 16)}…</span></DetailRow> : null}
              {message.tags.length > 0 ? <DetailRow label="Tags"><span className="font-mono text-xs">{message.tags.join(", ")}</span></DetailRow> : null}
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-muted-foreground">Signed proof</span>
                <DownloadProof messageId={message.id} />
              </div>
              <p className="py-3 text-xs text-muted-foreground">
                These identifiers are for the API, CLI, and SDK.{" "}
                <Link href="/docs" className="text-primary hover:underline">See the developer docs</Link>.
              </p>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
