import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Eye,
  Flag,
  Inbox,
  MousePointerClick,
  RotateCw,
  Send,
  ShieldOff,
  UserX,
  XCircle,
} from "lucide-react";
import { recordEvent } from "../actions";
import { ConnectionError as ConnectionErrorCard } from "@/components/app/connection-error";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { MessageStatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { MessageContent } from "./message-content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, titleCase } from "@/lib/format";
import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { AuditEntry, Message } from "@/lib/types";

const eventIcons: Record<string, typeof Circle> = {
  queued: Inbox,
  sending: Send,
  sent: Send,
  delivered: CheckCircle2,
  opened: Eye,
  clicked: MousePointerClick,
  bounced: AlertTriangle,
  complained: Flag,
  unsubscribed: UserX,
  failed: XCircle,
  suppressed: ShieldOff,
  retried: RotateCw,
};

const SIMULATE = [
  { event: "delivered", label: "Delivered" },
  { event: "opened", label: "Opened" },
  { event: "clicked", label: "Clicked" },
  { event: "bounced", label: "Bounced" },
  { event: "complained", label: "Complained" },
];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

function metaSuffix(meta: AuditEntry["metadata"]): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.reason === "string") parts.push(m.reason);
  if (typeof m.url === "string") parts.push(m.url);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
          message={
            err instanceof ConnectionError || err instanceof ApiError
              ? err.message
              : "An unexpected error occurred."
          }
          showReconnect={err instanceof ApiError}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={message.subject || "(no subject)"}
        description={`To ${message.to}`}
        backHref="/messages"
        backLabel="Messages"
        actions={<MessageStatusBadge status={message.status} />}
      />

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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              {trail.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1.5rem)] before:w-px before:bg-border">
                  {trail.map((e, i) => {
                    const Icon = eventIcons[e.event] ?? Circle;
                    return (
                      <li key={`${e.event}-${i}`} className="relative flex gap-4">
                        <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 pt-1">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="font-medium">{titleCase(e.event)}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(e.timestamp)}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-sm text-muted-foreground">
                            {e.actor}
                            {metaSuffix(e.metadata)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simulate a provider event</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Record a lifecycle event as if it came from the email provider. Bounces and
                complaints also add the recipient to the suppression list.
              </p>
              <form action={recordEvent} className="flex flex-wrap gap-2">
                <input type="hidden" name="messageId" value={message.id} />
                {SIMULATE.map((s) => (
                  <SubmitButton
                    key={s.event}
                    name="event"
                    value={s.event}
                    variant="outline"
                    size="sm"
                    pendingLabel="Recording…"
                  >
                    {s.label}
                  </SubmitButton>
                ))}
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <DetailRow label="Message ID">
              <span className="inline-flex items-center gap-1">
                <span className="font-mono text-xs">{message.id}</span>
                <CopyButton value={message.id} />
              </span>
            </DetailRow>
            <DetailRow label="Status">
              <MessageStatusBadge status={message.status} />
            </DetailRow>
            <DetailRow label="Type">
              <span className="capitalize">{message.type}</span>
            </DetailRow>
            <DetailRow label="Priority">
              <span className="capitalize">{message.priority}</span>
            </DetailRow>
            <DetailRow label="From">
              <span className="font-mono text-xs">{message.from.email}</span>
            </DetailRow>
            <DetailRow label="To">
              <span className="font-mono text-xs">{message.to}</span>
            </DetailRow>
            {message.sub_tenant_id ? (
              <DetailRow label="Sub-tenant">
                <Link
                  href={`/sub-tenants/${message.sub_tenant_id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {message.sub_tenant_id}
                </Link>
              </DetailRow>
            ) : null}
            <DetailRow label="Sandbox">
              {message.sandbox ? <Badge variant="warning">test</Badge> : <Badge variant="muted">no</Badge>}
            </DetailRow>
            {message.provider ? (
              <DetailRow label="Provider">
                <span className="capitalize">{message.provider}</span>
              </DetailRow>
            ) : null}
            {message.idempotency_key ? (
              <DetailRow label="Idempotency key">
                <span className="font-mono text-xs">{message.idempotency_key}</span>
              </DetailRow>
            ) : null}
            {message.tags.length > 0 ? (
              <DetailRow label="Tags">
                <span className="font-mono text-xs">{message.tags.join(", ")}</span>
              </DetailRow>
            ) : null}
            <DetailRow label="Created">{formatDateTime(message.created_at)}</DetailRow>
            {message.scheduled_at ? (
              <DetailRow label="Scheduled">{formatDateTime(message.scheduled_at)}</DetailRow>
            ) : null}
            {message.error ? (
              <DetailRow label="Error">
                <span className="text-destructive">{message.error}</span>
              </DetailRow>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
